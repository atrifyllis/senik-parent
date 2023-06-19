import {Construct} from "constructs";
import * as kplus from "cdk8s-plus-25";
import {EnvValue, PersistentVolumeClaim, ServiceType} from "cdk8s-plus-25";

export interface LokiOptions {
    readonly tempoHost: string;
    readonly tempoPort: number;
    readonly nodePort: number;
    readonly pvcName: string;
}

export class Loki extends Construct {
    constructor(scope: Construct, id: string, options: LokiOptions) {
        super(scope, id);

        const lokiDeployment = new kplus.Deployment(this, id, {
            replicas: 1,
            containers: [
                {
                    securityContext: {
                        allowPrivilegeEscalation: true,
                        privileged: true,
                        ensureNonRoot: false, // TODO not safe but wont work without it
                        readOnlyRootFilesystem: false // TODO not safe but wont work without it
                    },
                    image: 'grafana/loki',
                    ports: [
                        {number: 3100}
                    ],
                    envVariables: {
                        'JAEGER_AGENT_HOST': EnvValue.fromValue('tempo'),
                        'JAEGER_ENDPOINT': EnvValue.fromValue(`http://${options.tempoHost}:${options.tempoPort}/api/traces`),
                        'JAEGER_SAMPLER_TYPE': EnvValue.fromValue('const'),
                        'JAEGER_SAMPLER_PARAM': EnvValue.fromValue('1'),
                    },

                }
            ]
        });

        lokiDeployment.containers[0].mount(
            '/var/loki',
            kplus.Volume.fromPersistentVolumeClaim(
                this,
                `${id}-volume`,
                PersistentVolumeClaim.fromClaimName(this, `${options.pvcName}-volume`, options.pvcName)),

        );

        lokiDeployment.exposeViaService({
            serviceType: ServiceType.NODE_PORT,
            ports: [
                {
                    name: 'http',
                    port: 3100,
                    nodePort: options.nodePort
                }
            ]
        });
    }
}
