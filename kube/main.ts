import {Construct} from 'constructs';
import {App, Chart, Size} from 'cdk8s';
import * as kafkaStrimzi from './imports/kafka-kafka.strimzi.io';
import {
    KafkaSpecKafkaListenersType,
    KafkaSpecKafkaStorageType,
    KafkaSpecKafkaStorageVolumesType,
    KafkaSpecZookeeperStorageType
} from './imports/kafka-kafka.strimzi.io';
import * as kafkaConnector from './imports/kafka-connector-kafka.strimzi.io';
import * as kafkaConnectStrimzi from './imports/kafka-connect-kafka.strimzi.io';


import * as kplus from 'cdk8s-plus-25';
import {EnvValue, PersistentVolumeAccessMode} from 'cdk8s-plus-25';

export class MyChart extends Chart {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const kafkaInternalPort = 9092;
        // const debeziumVersion = '2.2.1.Final';
        const senikDbPort = '5432';


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

        const senikDbService = senikDb.exposeViaService({ports: [{port: 5432}]});

        const kafka = new kafkaStrimzi.Kafka(this, 'kafka-cluster', {
            spec: {

                kafka: {
                    replicas: 1,
                    listeners: [
                        {
                            name: 'plain',
                            port: kafkaInternalPort,
                            type: KafkaSpecKafkaListenersType.INTERNAL,
                            tls: false,

                        },
                        {
                            name: 'external',
                            port: 9093,
                            type: KafkaSpecKafkaListenersType.INGRESS, // best way to expose kafka to host with k3d is through ingress
                            tls: true,
                            configuration: {
                                bootstrap: {
                                    host: 'kubernetes.docker.internal' // this way we can connect to kafka from host
                                },
                                brokers: [
                                    {
                                        broker: 0,
                                        host: 'broker-0.kubernetes.docker.internal', // TODO not sure where this is needed

                                    }
                                ]
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
                    }

                },
                zookeeper: {
                    replicas: 1,
                    storage: {
                        type: KafkaSpecZookeeperStorageType.PERSISTENT_CLAIM,
                        size: '1Gi'
                    }
                }
            }
        });

        let kafkaBootstrapServers = `${kafka.name}-kafka-bootstrap:${kafkaInternalPort}`;

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
                // TODO uncomment if image is not available
                // build: {
                //     output: {
                //         image: 'otinanism/strimzi-connect',
                //         type: KafkaConnectSpecBuildOutputType.DOCKER,
                //         pushSecret: 'regcred'
                //     },
                //     plugins: [
                //         {
                //             name: 'debezium-postgres-connector',
                //             artifacts: [
                //                 {
                //                     type: KafkaConnectSpecBuildPluginsArtifactsType.TGZ,
                //                     url: `https://repo1.maven.org/maven2/io/debezium/debezium-connector-postgres/${debeziumVersion}/debezium-connector-postgres-${debeziumVersion}-plugin.tar.gz`
                //                 }
                //             ]
                //         }
                //     ]
                // }

            }
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
                    'database.port': senikDbPort,
                    'database.user': 'senik',
                    'database.password': 'senik',
                    'database.dbname': 'senik',
                    'database.server.name': 'db',
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

        let kafkaUiService = kafkaUi.exposeViaService({ports: [{port: 8080 }]});
        const ingress = new kplus.Ingress(this, 'kafka-ui-ingress');
        ingress.addRule('/', kplus.IngressBackend.fromService(kafkaUiService));




    }
}

const app = new App();
new MyChart(app, 'kafka');
app.synth();
