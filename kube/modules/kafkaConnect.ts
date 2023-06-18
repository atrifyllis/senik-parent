import {Construct} from "constructs";
import * as kafkaConnectStrimzi from "../imports/kafka-connect-kafka.strimzi.io";
import {
    KafkaConnectSpecMetricsConfigType,
    KafkaConnectSpecTracingType
} from "../imports/kafka-connect-kafka.strimzi.io";
import * as kafkaConnector from "../imports/kafka-connector-kafka.strimzi.io";
import * as kplus from 'cdk8s-plus-25';


export interface KafkaConnectOptions {

    readonly kafkaBootstrapServers: string;
    readonly name: string;
    readonly image: string;
    readonly connectorId: string;
    readonly connectorName: string;
    readonly dbHost: string;
    readonly dbPort: number;
    readonly dbUser: string;
    readonly dbPassword: string;
    readonly dbName: string;
    readonly outboxTopic: string;
    readonly metricsConfigMapKey: string;
    readonly metricsConfigMapName: string;
}

export class KafkaConnect extends Construct {
    public name: string;

    constructor(scope: Construct, id: string, options: KafkaConnectOptions) {
        super(scope, id);

        const kafkaConnect = new kafkaConnectStrimzi.KafkaConnect(this, 'kafka-connect-cluster', {
            metadata: {
                annotations: {
                    'strimzi.io/use-connector-resources': 'true' // needed to enable kafka connectors
                }
            },
            spec: {

/*                logging: {
                    type: KafkaConnectSpecLoggingType.INLINE,
                    loggers: {
                        'connect.root.logger.level': 'DEBUG'
                    }
                },*/
                image: options.image,
                replicas: 1,
                bootstrapServers: options.kafkaBootstrapServers,
                config: {
                    'group.id': `${options.name}-connect-group`,
                    'offset.storage.topic': `${options.name}-offsets`,
                    'config.storage.topic': `${options.name}-config`,
                    'status.storage.topic': `${options.name}-status`,
                    'config.storage.replication.factor': 1,
                    'offset.storage.replication.factor': 1,
                    'status.storage.replication.factor': 1
                },
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
                metricsConfig: {
                    type: KafkaConnectSpecMetricsConfigType.JMX_PROMETHEUS_EXPORTER,
                    valueFrom: {
                        configMapKeyRef: {
                            name: options.metricsConfigMapName,
                            key: options.metricsConfigMapKey
                        }
                    },
                },
                tracing: {
                    type: KafkaConnectSpecTracingType.JAEGER,
                },

                template: {

                    connectContainer: {
                        env: [
                            {
                                name: 'JAVA_TOOL_OPTIONS',
                                value: '-agentlib:jdwp=transport=dt_socket,address=*:5005,server=y,suspend=n'
                            },
                            {
                                name: 'JAEGER_SERVICE_NAME',
                                value: 'kafka-connect'
                            },
/*                            {
                                name: 'JAEGER_AGENT_HOST',
                                value: 'snk-tempo-service'
                            },
                            {
                                name: 'JAEGER_AGENT_PORT',
                                value: '6831'
                            },*/
                            {
                                name: 'JAEGER_SAMPLER_TYPE',
                                value: 'const'
                            },
                            {
                                name: 'JAEGER_SAMPLER_PARAM',
                                value: '1'
                            },
                            {
                                name: 'JAEGER_ENDPOINT',
                                value: 'http://snk-tempo-service:14268/api/traces'
                            },
                            {
                                name: 'JAEGER_PROPAGATION',
                                value: 'b3'
                            }
                        ]
                    }
                },

            },
        });

        new kafkaConnector.KafkaConnector(this, options.connectorId, {
            metadata: {
                name: options.connectorName,
                labels: {
                    'strimzi.io/cluster': kafkaConnect.name // required!
                }
            },
            spec: {
                class: 'io.debezium.connector.postgresql.PostgresConnector',
                config: {
                    'connector.class': 'io.debezium.connector.postgresql.PostgresConnector',
                    'database.hostname': options.dbHost,
                    'database.port': options.dbPort,
                    'database.user': options.dbUser,
                    'database.password': options.dbPassword,
                    'database.dbname': options.dbName,
                    'database.server.name': options.dbHost,
                    'key.converter': 'org.apache.kafka.connect.json.JsonConverter',
                    'key.converter.schemas.enable': 'false',
                    'value.converter': 'org.apache.kafka.connect.json.JsonConverter',
                    'value.converter.schemas.enable': 'false',
                    'tombstones.on.delete': 'false',
                    'table.include.list': 'public.persisted_event',
                    'topic.prefix': options.dbName,
                    'transforms': 'outbox',
                    'transforms.outbox.type': 'io.debezium.transforms.outbox.EventRouter',
                    'transforms.outbox.table.expand.json.payload': 'true',
                    'transforms.outbox.route.topic.replacement': options.outboxTopic,
                    // 'transforms.outbox.table.fields.additional.placement': 'tracingspancontext:header:traceparent'
                    'consumer.interceptor.classes': 'io.opentracing.contrib.kafka.TracingConsumerInterceptor',
                    'producer.interceptor.classes': 'io.opentracing.contrib.kafka.TracingProducerInterceptor'
                }
            }
        });


        // for debugging purposes only
        let connectService = new kplus.Service(this, 'connect-service', {
            type: kplus.ServiceType.NODE_PORT,
            ports: [
                {
                    name: 'debug',
                    port: 5005,
                    nodePort: 30016
                }
            ],
        });

        connectService.selectLabel('strimzi.io/cluster','snk-kafka-connect-cluster');
        connectService.selectLabel('strimzi.io/kind','KafkaConnect');
        connectService.selectLabel('strimzi.io/name','snk-kafka-connect-cluster-connect');

        this.name = kafkaConnect.name
    }
}
