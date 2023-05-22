import {Construct} from 'constructs';
import {App, Chart} from 'cdk8s';
import * as strmizi from './imports/kafka.strimzi.io';
import {
    KafkaSpecKafkaListenersType,
    KafkaSpecKafkaStorageType,
    KafkaSpecKafkaStorageVolumesType,
    KafkaSpecZookeeperStorageType
} from './imports/kafka.strimzi.io';

class MyChart extends Chart {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        new strmizi.Kafka(this, 'kafka-cluster', {
            spec: {
                kafka: {
                    replicas: 1,
                    listeners: [
                        {
                            name: 'plain',
                            port: 9092,
                            type: KafkaSpecKafkaListenersType.INTERNAL,
                            tls: false
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
                                        host: 'broker-0.kubernetes.docker.internal' // TODO not sure where this is needed
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
    }
}

const app = new App();
new MyChart(app, 'kafka');
app.synth();
