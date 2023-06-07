import {Construct} from "constructs";
import * as kafkaStrimzi from "../imports/kafka-kafka.strimzi.io";
import {
    KafkaSpecKafkaListenersType,
    KafkaSpecKafkaMetricsConfigType,
    KafkaSpecKafkaStorageType,
    KafkaSpecKafkaStorageVolumesType,
    KafkaSpecZookeeperStorageType
} from "../imports/kafka-kafka.strimzi.io";

export interface KafkaServerOptions {
    readonly internalPort: number;
    readonly externalPort: number;
    readonly nodePort: number;
    readonly metricsConfigMapName: string;
    readonly metricsConfigMapKey: string;

}

export class KafkaServer extends Construct {
    public name: string;

    constructor(scope: Construct, id: string, options: KafkaServerOptions) {
        super(scope, id);

        const kafka = new kafkaStrimzi.Kafka(this, id, {
            spec: {


                kafka: {
                    replicas: 1,
                    listeners: [
                        {
                            name: 'plain',
                            port: options.internalPort,
                            type: KafkaSpecKafkaListenersType.INTERNAL,
                            tls: false,

                        },
                        {
                            name: 'external',
                            port: options.externalPort,
                            type: KafkaSpecKafkaListenersType.NODEPORT,
                            tls: false,
                            configuration: {
                                brokers: [
                                    {
                                        broker: 0,
                                        advertisedHost: 'localhost',
                                        nodePort: options.nodePort
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
                                name: options.metricsConfigMapName,
                                key: options.metricsConfigMapKey
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
                    // logging: 'debug',

                }
            }
        });
        this.name = kafka.name;
    }
}
