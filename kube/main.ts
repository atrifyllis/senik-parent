import {Construct} from 'constructs';
import {App, Chart} from 'cdk8s';
import * as kafkaStrimzi from './imports/kafka-kafka.strimzi.io';
import {
    KafkaSpecKafkaListenersType,
    KafkaSpecKafkaMetricsConfigType,
    KafkaSpecKafkaStorageType,
    KafkaSpecKafkaStorageVolumesType,
    KafkaSpecZookeeperStorageType
} from './imports/kafka-kafka.strimzi.io';


import * as kplus from 'cdk8s-plus-25';
import {EnvValue, HttpIngressPathType, ServiceType} from 'cdk8s-plus-25';
import {ChartProps} from "cdk8s/lib/chart";
import {Postgresql} from "./postgresql";
import {KafkaConnect} from "./kafkaConnect";

const SENIK_DB_PORT = 5432;
const SENIK_DB_NODE_PORT = 30020;

const KAFKA_INTERNAL_PORT = 9092;
const KAFKA_NODE_PORT = 30019;
const KAFKA_METRICS_CONFIG_KEY = 'kafka-metrics-config.yaml';

const KAFKA_UI_LOCAL_ADDRESS = 'kafka-ui.127.0.0.1.nip.io';

export class MyChart extends Chart {
    constructor(scope: Construct, id: string, props: ChartProps) {
        super(scope, id, props);

        let senikDb = new Postgresql(this, 'senik-db', {
            image: 'debezium/postgres:14',
            portNumber: SENIK_DB_PORT,
            user: 'senik',
            password: 'senik',
            dbName: 'senik',
            nodePortNumber: SENIK_DB_NODE_PORT
        });


        // without the rules in this configmap the strimzi-kafka dashboard does not work!
        let kafkaPrometheusConfigMap = new kplus.ConfigMap(this, 'kafka-prom-configmap', {});
        kafkaPrometheusConfigMap.addData(KAFKA_METRICS_CONFIG_KEY, `
            
        # unfortunately, an empty file did not work
        lowercaseOutputName: true
        lowercaseOutputLabelNames: true # without it, kafka metrics are snake case and grafana dashboards won't work
        rules:
          # Special cases and very specific rules
          - pattern: kafka.server<type=(.+), name=(.+), clientId=(.+), topic=(.+), partition=(.*)><>Value
            name: kafka_server_$1_$2
            type: GAUGE
            labels:
              clientId: "$3"
              topic: "$4"
              partition: "$5"
          - pattern: kafka.server<type=(.+), name=(.+), clientId=(.+), brokerHost=(.+), brokerPort=(.+)><>Value
            name: kafka_server_$1_$2
            type: GAUGE
            labels:
              clientId: "$3"
              broker: "$4:$5"
          - pattern: kafka.server<type=(.+), cipher=(.+), protocol=(.+), listener=(.+), networkProcessor=(.+)><>connections
            name: kafka_server_$1_connections_tls_info
            type: GAUGE
            labels:
              cipher: "$2"
              protocol: "$3"
              listener: "$4"
              networkProcessor: "$5"
          - pattern: kafka.server<type=(.+), clientSoftwareName=(.+), clientSoftwareVersion=(.+), listener=(.+), networkProcessor=(.+)><>connections
            name: kafka_server_$1_connections_software
            type: GAUGE
            labels:
              clientSoftwareName: "$2"
              clientSoftwareVersion: "$3"
              listener: "$4"
              networkProcessor: "$5"
          - pattern: "kafka.server<type=(.+), listener=(.+), networkProcessor=(.+)><>(.+):"
            name: kafka_server_$1_$4
            type: GAUGE
            labels:
              listener: "$2"
              networkProcessor: "$3"
          - pattern: kafka.server<type=(.+), listener=(.+), networkProcessor=(.+)><>(.+)
            name: kafka_server_$1_$4
            type: GAUGE
            labels:
              listener: "$2"
              networkProcessor: "$3"
          # Some percent metrics use MeanRate attribute
          # Ex) kafka.server<type=(KafkaRequestHandlerPool), name=(RequestHandlerAvgIdlePercent)><>MeanRate
          - pattern: kafka.(\\w+)<type=(.+), name=(.+)Percent\\w*><>MeanRate
            name: kafka_$1_$2_$3_percent
            type: GAUGE
          # Generic gauges for percents
          - pattern: kafka.(\\w+)<type=(.+), name=(.+)Percent\\w*><>Value
            name: kafka_$1_$2_$3_percent
            type: GAUGE
          - pattern: kafka.(\\w+)<type=(.+), name=(.+)Percent\\w*, (.+)=(.+)><>Value
            name: kafka_$1_$2_$3_percent
            type: GAUGE
            labels:
              "$4": "$5"
          # Generic per-second counters with 0-2 key/value pairs
          - pattern: kafka.(\\w+)<type=(.+), name=(.+)PerSec\\w*, (.+)=(.+), (.+)=(.+)><>Count
            name: kafka_$1_$2_$3_total
            type: COUNTER
            labels:
              "$4": "$5"
              "$6": "$7"
          - pattern: kafka.(\\w+)<type=(.+), name=(.+)PerSec\\w*, (.+)=(.+)><>Count
            name: kafka_$1_$2_$3_total
            type: COUNTER
            labels:
              "$4": "$5"
          - pattern: kafka.(\\w+)<type=(.+), name=(.+)PerSec\\w*><>Count
            name: kafka_$1_$2_$3_total
            type: COUNTER
          # Generic gauges with 0-2 key/value pairs
          - pattern: kafka.(\\w+)<type=(.+), name=(.+), (.+)=(.+), (.+)=(.+)><>Value
            name: kafka_$1_$2_$3
            type: GAUGE
            labels:
              "$4": "$5"
              "$6": "$7"
          - pattern: kafka.(\\w+)<type=(.+), name=(.+), (.+)=(.+)><>Value
            name: kafka_$1_$2_$3
            type: GAUGE
            labels:
              "$4": "$5"
          - pattern: kafka.(\\w+)<type=(.+), name=(.+)><>Value
            name: kafka_$1_$2_$3
            type: GAUGE
          # Emulate Prometheus 'Summary' metrics for the exported 'Histogram's.
          # Note that these are missing the '_sum' metric!
          - pattern: kafka.(\\w+)<type=(.+), name=(.+), (.+)=(.+), (.+)=(.+)><>Count
            name: kafka_$1_$2_$3_count
            type: COUNTER
            labels:
              "$4": "$5"
              "$6": "$7"
          - pattern: kafka.(\\w+)<type=(.+), name=(.+), (.+)=(.*), (.+)=(.+)><>(\\d+)thPercentile
            name: kafka_$1_$2_$3
            type: GAUGE
            labels:
              "$4": "$5"
              "$6": "$7"
              quantile: "0.$8"
          - pattern: kafka.(\\w+)<type=(.+), name=(.+), (.+)=(.+)><>Count
            name: kafka_$1_$2_$3_count
            type: COUNTER
            labels:
              "$4": "$5"
          - pattern: kafka.(\\w+)<type=(.+), name=(.+), (.+)=(.*)><>(\\d+)thPercentile
            name: kafka_$1_$2_$3
            type: GAUGE
            labels:
              "$4": "$5"
              quantile: "0.$6"
          - pattern: kafka.(\\w+)<type=(.+), name=(.+)><>Count
            name: kafka_$1_$2_$3_count
            type: COUNTER
          - pattern: kafka.(\\w+)<type=(.+), name=(.+)><>(\\d+)thPercentile
            name: kafka_$1_$2_$3
            type: GAUGE
            labels:
              quantile: "0.$4"

            
        `)

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
                                name: kafkaPrometheusConfigMap.name,
                                key: KAFKA_METRICS_CONFIG_KEY
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

        // extra grafana dashboards
        let kafkaDashboardsConfigMap = new kplus.ConfigMap(this, 'kafka-dashboards', {
            metadata: {
                labels: {
                    'grafana_dashboard': '1'
                }
            }
        });

        kafkaDashboardsConfigMap.addFile('../obs/dashboards/new/strimzi-kafka-exporter.json', 'strimzi-kafka-exporter.json');
        kafkaDashboardsConfigMap.addFile('../obs/dashboards/new/strimzi-kafka.json', 'strimzi-kafka.json');

        let springDashboardsConfigMap = new kplus.ConfigMap(this, 'spring-dashboards', {
            metadata: {
                labels: {
                    'grafana_dashboard': '1'
                }
            }
        });
        springDashboardsConfigMap.addFile('../obs/dashboards/new/spring-boot-hikaricp-jdbc_rev5.json', 'hikari-dashboard.json')
        springDashboardsConfigMap.addFile('../obs/dashboards/new/spring-boot-observability_rev1.json', 'spring-boot-dashboard.json')
        springDashboardsConfigMap.addFile('../obs/dashboards/new/jvm-micrometer_rev9.json', 'jvm-micrometer_rev9.json')

        // kafkaDashboardsConfigMap.addFile('../obs/dashboards/new/logs_traces_metrics.json', 'logs_traces_metrics.json')

        // kafka connect
        let kafkaBootstrapServers = `${kafka.name}-kafka-bootstrap:${KAFKA_INTERNAL_PORT}`;

        let kafkaConnect = new KafkaConnect(this, 'kafka-connect-cluster', {
            image: 'otinanism/strimzi-connect',
            kafkaBootstrapServers: kafkaBootstrapServers,
            name: 'senik-debezium',
            connectorId: 'postgres-sink-kafka-connector',
            connectorName: 'senik-outbox-connector',
            dbHost: senikDb.serviceName,
            dbPort: SENIK_DB_PORT,
            dbUser: 'senik',
            dbPassword: 'senik',
            dbName: 'senik',
            outboxTopic: 'senik.events'
        });

        let kafkaConnectAddress = `http://${kafkaConnect.name}-connect-api:8083`;

        // kafka ui
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

        // tempo
        const tempoDeployment = new kplus.Deployment(this, 'tempo', {

            replicas: 1,
            containers: [
                {
                    securityContext: {
                        allowPrivilegeEscalation: true,
                        privileged: true,
                        ensureNonRoot: false, // TODO not safe but wont work without it
                        readOnlyRootFilesystem: false // TODO not safe but wont work without it
                    },
                    image: 'grafana/tempo',
                    ports: [
                        {number: 14268},
                        {number: 9411},
                        {number: 3200},
                    ],
                    args: ['-config.file=/etc/tempo/tempo.yaml']
                }
            ]
        });

        tempoDeployment.exposeViaService({
            serviceType: ServiceType.NODE_PORT,
            ports: [
                {
                    name: 'zipkin',
                    port: 9411,
                    nodePort: 30017
                },
                {
                    name: 'jaeger',
                    port: 14268
                },
                {
                    name: 'http',
                    port: 3200
                }
            ]
        })

        const tempoConfigMap = new kplus.ConfigMap(this, 'tempoConfig', {});
        tempoConfigMap.addFile('../obs/tempo-config.yaml', 'tempo.yaml')

        const tempoVolume = kplus.Volume.fromConfigMap(this, 'tempoVolume', tempoConfigMap);

        tempoDeployment.containers[0].mount('/etc/tempo', tempoVolume, {
            readOnly: false,
        })
    }
}

const app = new App();
new MyChart(app, 'snk', {
    disableResourceNameHashes: true
});
app.synth();
