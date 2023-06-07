import {Construct} from "constructs";
import * as kplus from "cdk8s-plus-25";
import {EnvValue, HttpIngressPathType} from "cdk8s-plus-25";

export interface KafkaUiOptions {
    readonly kafkaBootstrapServers: string;
    readonly kafkaConnectName: string;
    readonly kafkaConnectAddress: string;
    readonly kafkaUiAddress: string;
}

export class KafkaUi extends Construct {

    constructor(scope: Construct, id: string, options: KafkaUiOptions) {
        super(scope, id);

        const kafkaUi = new kplus.Deployment(this, id, {
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
                        'KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS': EnvValue.fromValue(options.kafkaBootstrapServers),
                        'KAFKA_CLUSTERS_0_KAFKACONNECT_0_NAME': EnvValue.fromValue(options.kafkaConnectName),
                        'KAFKA_CLUSTERS_0_KAFKACONNECT_0_ADDRESS': EnvValue.fromValue(options.kafkaConnectAddress),
                        'DYNAMIC_CONFIG_ENABLED': EnvValue.fromValue('true')
                    }
                }
            ]
        });

        let kafkaUiService = kafkaUi.exposeViaService({ports: [{port: 8080}]});
        const ingress = new kplus.Ingress(this, 'ingress');
        // TODO this is so ugly

        ingress.addHostRule(options.kafkaUiAddress, '/', kplus.IngressBackend.fromService(kafkaUiService), HttpIngressPathType.PREFIX);

    }
}
