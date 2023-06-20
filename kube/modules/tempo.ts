import {Construct} from "constructs";
import * as kplus from "cdk8s-plus-25";
import {PersistentVolumeClaim, ServiceType} from "cdk8s-plus-25";

export interface TempoOptions {
    readonly zipkinNodePort: number; // since zipkin will be accessed from host
    readonly configFilePath: string;
    readonly pvcName: string;
}

export class Tempo extends Construct {
    serviceName: string;

    constructor(scope: Construct, id: string, options: TempoOptions) {
        super(scope, id);

        const tempoDeployment = new kplus.Deployment(this, id, {

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
                        {number: 6832},
                        {number: 6831},
                    ],
                    args: ['-config.file=/etc/tempo/tempo-config.yaml']
                }
            ]
        });

        let service = tempoDeployment.exposeViaService({
            serviceType: ServiceType.NODE_PORT,
            ports: [
                {
                    name: 'zipkin',
                    port: 9411,
                    nodePort: options.zipkinNodePort
                },
                {
                    name: 'jaeger',
                    port: 14268
                },
                {
                    name: 'jaeger-thrift',
                    port: 6832
                },
                {
                    name: 'jaeger-thrift-what',
                    port: 6831
                },
                {
                    name: 'http',
                    port: 3200
                }
            ]
        });

        const tempoConfigMap = new kplus.ConfigMap(this, 'Config', {});
        tempoConfigMap.addFile(options.configFilePath, 'tempo-config.yaml')

        const tempoVolume = kplus.Volume.fromConfigMap(this, 'tempoVolume', tempoConfigMap);

        tempoDeployment.containers[0].mount('/etc/tempo', tempoVolume, {
            readOnly: false,
        })

        tempoDeployment.containers[0].mount(
            '/etc/tempo',
            kplus.Volume.fromPersistentVolumeClaim(
                this,
                `${id}-volume`,
                PersistentVolumeClaim.fromClaimName(this, `${options.pvcName}-volume`, options.pvcName)),
        );


        this.serviceName = service.name;
    }
}
