import {Construct} from 'constructs';
import {App, Chart} from 'cdk8s';
import * as kafkaStrimzi from './imports/kafka-kafka.strimzi.io';
import {
    KafkaSpecKafkaListenersType,
    KafkaSpecKafkaStorageType,
    KafkaSpecKafkaStorageVolumesType,
    KafkaSpecZookeeperStorageType
} from './imports/kafka-kafka.strimzi.io';
import * as kafkaConnector from './imports/kafka-connector-kafka.strimzi.io';
import * as kafkaConnectStrimzi from './imports/kafka-connect-kafka.strimzi.io';

class MyChart extends Chart {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        const internalPort = 9092;
        const kafka = new kafkaStrimzi.Kafka(this, 'kafka-cluster', {
            spec: {

                kafka: {
                    replicas: 1,
                    listeners: [
                        {
                            name: 'plain',
                            port: internalPort,
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
                                size: '10Gi',
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
                        size: '10Gi'
                    }
                }
            }
        });

        new kafkaConnectStrimzi.KafkaConnect(this, 'kafka-connect-cluster', {
            metadata: {
                annotations: {
                    'strimzi.io/use-connector-resources': 'true' // needed to enable kafka connectors
                }
            },
            spec: {
                image: 'debezium/connect:latest',
                replicas: 1,
                bootstrapServers: `${kafka.name}-kafka-bootstrap:${internalPort}`,
                config: {
                    'group.id': 'senik-debezium-connect-group',
                    'offset.storage.topic': 'senik-debezium-offsets',
                    'config.storage.topic': 'senik-debezium-config',
                    'status.storage.topic': 'senik-debezium-status'
                }
            }
        });

        new kafkaConnector.KafkaConnector(this, 'postgres-sink-kafka-connector', {
            metadata: {
                name: 'senik-outbox-connector'
            },
            spec: {
                config: {
                    'connector.class': 'io.debezium.connector.postgresql.PostgresConnector',
                    'database.hostname': 'db',
                    'database.port': '5432',
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

    }
}

const app = new App();
new MyChart(app, 'kafka');
app.synth();
