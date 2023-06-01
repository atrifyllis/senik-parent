import {Construct} from 'constructs';
import {App, Chart, Size} from 'cdk8s';
import * as kafkaStrimzi from './imports/kafka-kafka.strimzi.io';
import {
    KafkaSpecKafkaListenersType,
    KafkaSpecKafkaMetricsConfigType,
    KafkaSpecKafkaStorageType,
    KafkaSpecKafkaStorageVolumesType,
    KafkaSpecZookeeperStorageType
} from './imports/kafka-kafka.strimzi.io';
import * as kafkaConnector from './imports/kafka-connector-kafka.strimzi.io';
import * as kafkaConnectStrimzi from './imports/kafka-connect-kafka.strimzi.io';
import {KafkaConnectSpecLoggingType} from './imports/kafka-connect-kafka.strimzi.io';


import * as kplus from 'cdk8s-plus-25';
import {EnvValue, HttpIngressPathType, PersistentVolumeAccessMode, ServiceType} from 'cdk8s-plus-25';
import {ChartProps} from "cdk8s/lib/chart";


const SENIK_DB_PORT = 5432;
const SENIK_DB_NODE_PORT = 30020;

const KAFKA_INTERNAL_PORT = 9092;
const KAFKA_NODE_PORT = 30019;
const KAFKA_UI_LOCAL_ADDRESS = 'kafka-ui.127.0.0.1.nip.io';

export class MyChart extends Chart {
    constructor(scope: Construct, id: string, props: ChartProps) {
        super(scope, id, props);

        const senikDb = new kplus.Deployment(this, 'senik-db', {
            replicas: 1,
            containers: [
                {
                    securityContext: {
                        ensureNonRoot: false, // TODO not safe but wont work without it
                        readOnlyRootFilesystem: false // TODO not safe but wont work without it
                    },
                    image: 'debezium/postgres:14',
                    portNumber: 5432,
                    envVariables: {
                        'POSTGRES_USER': EnvValue.fromValue('senik'),
                        'POSTGRES_PASSWORD': EnvValue.fromValue('senik'),
                        'POSTGRES_DB': EnvValue.fromValue('senik')
                    },
                },
            ],

        });
        // create the storage request
        const senikDbClaim = new kplus.PersistentVolumeClaim(this, 'senik-db-pvc', {
            storage: Size.gibibytes(1),
            accessModes: [
                PersistentVolumeAccessMode.READ_WRITE_ONCE
            ]
        });
        // mount a volume based on the request to the container
        // this will also add the volume itself to the pod spec.
        senikDb.containers[0].mount(
            '/var/lib/postgresql/data',
            kplus.Volume.fromPersistentVolumeClaim(this, 'db-senik-volume', senikDbClaim),
            {
                subPath: 'postgres'
            }
        );

        // db exposed as node service to one of the available host ports (30020)
        const senikDbService = senikDb.exposeViaService({
            ports: [{port: SENIK_DB_PORT, nodePort: SENIK_DB_NODE_PORT}],
            serviceType: ServiceType.NODE_PORT
        });

        // this config map is only needed by strimzi to enable prometheus. what a mess...
        // From strimzi docs: "You can enable metrics without further configuration using a reference to a ConfigMap
        // containing an empty file under metricsConfig.valueFrom.configMapKeyRef.key."
        let dummyKafkaConfigMap = new kplus.ConfigMap(this, 'dummy-configmap', {});
        dummyKafkaConfigMap.addFile('empty-file.yaml', 'dummy');

        const kafka = new kafkaStrimzi.Kafka(this, 'kafka-cluster', {
            spec: {


                kafka: {
                    replicas: 1,
                    listeners: [
                        {
                            name: 'plain',
                            port: KAFKA_INTERNAL_PORT,
                            type: KafkaSpecKafkaListenersType.INTERNAL,
                            tls: false,

                        },
                        {
                            name: 'external',
                            port: 9093,
                            type: KafkaSpecKafkaListenersType.NODEPORT,
                            tls: false,
                            configuration: {
                                brokers: [
                                    {
                                        broker: 0,
                                        advertisedHost: 'localhost',
                                        nodePort: KAFKA_NODE_PORT
                                    }
                                ],
                            }
                        }
                    ],

                    storage: {
                        type: KafkaSpecKafkaStorageType.JBOD,
                        volumes: [
                            {
                                id: 0,
                                type: KafkaSpecKafkaStorageVolumesType.PERSISTENT_CLAIM,
                                size: '1Gi',
                            }
                        ]
                    },
                    config: {
                        'offsets.topic.replication.factor': 1
                    },
                    metricsConfig: {
                        type: KafkaSpecKafkaMetricsConfigType.JMX_PROMETHEUS_EXPORTER,
                        valueFrom: {
                            configMapKeyRef: {
                                name: dummyKafkaConfigMap.name,
                                key: 'dummy'
                            }
                        },

                    }
                },
                zookeeper: {
                    replicas: 1,
                    storage: {
                        type: KafkaSpecZookeeperStorageType.PERSISTENT_CLAIM,
                        size: '1Gi'
                    }
                },
                kafkaExporter: {
                    groupRegex: '.*',
                    topicRegex: '.*',
                    logging: 'debug',

                }
            }
        });

        let strimziKafkaDashboardConfigmap = new kplus.ConfigMap(this, 'strimzi-kafka-dashboard', {
            metadata: {
                labels: {
                    'grafana_dashboard': '1'
                }
            }
        });
        strimziKafkaDashboardConfigmap.addFile('../obs/dashboards/new/strimzi-kafka.json', 'strimzi-kafka.json');

        let strimziKafkaExporterDashboardConfigmap = new kplus.ConfigMap(this, 'strimzi-kafka-exporter-dashboard', {
            metadata: {
                labels: {
                    'grafana_dashboard': '1'
                }
            }
        });
        strimziKafkaExporterDashboardConfigmap.addFile('../obs/dashboards/new/strimzi-kafka-exporter.json', 'strimzi-kafka-exporter.json');


        let kafkaBootstrapServers = `${kafka.name}-kafka-bootstrap:${KAFKA_INTERNAL_PORT}`;

        const kafkaConnect = new kafkaConnectStrimzi.KafkaConnect(this, 'kafka-connect-cluster', {
            metadata: {
                annotations: {
                    'strimzi.io/use-connector-resources': 'true' // needed to enable kafka connectors
                }
            },
            spec: {
                image: 'otinanism/strimzi-connect',
                replicas: 1,
                bootstrapServers: kafkaBootstrapServers,
                config: {
                    'group.id': 'senik-debezium-connect-group',
                    'offset.storage.topic': 'senik-debezium-offsets',
                    'config.storage.topic': 'senik-debezium-config',
                    'status.storage.topic': 'senik-debezium-status',
                    'config.storage.replication.factor': 1,
                    'offset.storage.replication.factor': 1,
                    'status.storage.replication.factor': 1
                },
                logging: {
                    type: KafkaConnectSpecLoggingType.INLINE,
                    loggers: {
                        'log4j.rootLogger': 'INFO'
                    }
                }
                /*                TODO uncomment if image is not available
                                build: {
                                    output: {
                                        image: 'otinanism/strimzi-connect',
                                        type: KafkaConnectSpecBuildOutputType.DOCKER,
                                        pushSecret: 'regcred'
                                    },
                                    plugins: [
                                        {
                                            name: 'debezium-postgres-connector',
                                            artifacts: [
                                                {
                                                    type: KafkaConnectSpecBuildPluginsArtifactsType.TGZ,
                                                    url: `https://repo1.maven.org/maven2/io/debezium/debezium-connector-postgres/${debeziumVersion}/debezium-connector-postgres-${debeziumVersion}-plugin.tar.gz`
                                                }
                                            ]
                                        }
                                    ]
                                }*/

            },

        });

        new kafkaConnector.KafkaConnector(this, 'postgres-sink-kafka-connector', {
            metadata: {
                name: 'senik-outbox-connector',
                labels: {
                    'strimzi.io/cluster': kafkaConnect.name // required!
                }
            },
            spec: {
                class: 'io.debezium.connector.postgresql.PostgresConnector',
                config: {
                    'connector.class': 'io.debezium.connector.postgresql.PostgresConnector',
                    'database.hostname': senikDbService.name,
                    'database.port': SENIK_DB_PORT,
                    'database.user': 'senik',
                    'database.password': 'senik',
                    'database.dbname': 'senik',
                    'database.server.name': senikDbService.name,
                    'key.converter': 'org.apache.kafka.connect.json.JsonConverter',
                    'key.converter.schemas.enable': 'false',
                    'value.converter': 'org.apache.kafka.connect.json.JsonConverter',
                    'value.converter.schemas.enable': 'false',
                    'tombstones.on.delete': 'false',
                    'table.include.list': 'public.persisted_event',
                    'topic.prefix': 'senik',
                    'transforms': 'outbox',
                    'transforms.outbox.type': 'io.debezium.transforms.outbox.EventRouter',
                    'transforms.outbox.table.expand.json.payload': 'true',
                    'transforms.outbox.route.topic.replacement': 'senik.events',
                    'transforms.outbox.table.fields.additional.placement': 'tracingspancontext:header:traceparent'
                }
            }
        });

        let kafkaConnectAddress = `http://${kafkaConnect.name}-connect-api:8083`;

        const kafkaUi = new kplus.Deployment(this, 'kafka-ui', {
            replicas: 1,
            containers: [
                {
                    securityContext: {
                        ensureNonRoot: false
                    },
                    image: 'provectuslabs/kafka-ui:latest',
                    portNumber: 8080,
                    envVariables: {
                        'KAFKA_CLUSTERS_0_NAME': EnvValue.fromValue('local'),
                        'KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS': EnvValue.fromValue(kafkaBootstrapServers),
                        'KAFKA_CLUSTERS_0_KAFKACONNECT_0_NAME': EnvValue.fromValue(kafkaConnect.name),
                        'KAFKA_CLUSTERS_0_KAFKACONNECT_0_ADDRESS': EnvValue.fromValue(kafkaConnectAddress),
                        'DYNAMIC_CONFIG_ENABLED': EnvValue.fromValue('true')
                    }
                }
            ]
        });

        let kafkaUiService = kafkaUi.exposeViaService({ports: [{port: 8080}]});
        const ingress = new kplus.Ingress(this, 'kafka-ui-ingress');
        // TODO this is so ugly

        ingress.addHostRule(KAFKA_UI_LOCAL_ADDRESS, '/', kplus.IngressBackend.fromService(kafkaUiService), HttpIngressPathType.PREFIX);

    }
}

const app = new App();
new MyChart(app, 'snk', {
    disableResourceNameHashes: true
});
app.synth();
