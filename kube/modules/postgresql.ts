import {Construct} from "constructs";
import * as kplus from "cdk8s-plus-25";
import {EnvValue, PersistentVolumeClaim, Service, ServiceType} from "cdk8s-plus-25";

export interface PostgresqlOptions {

    readonly image: string;
    readonly portNumber: number;
    readonly nodePortNumber: number;
    readonly user: string;
    readonly password: string;
    readonly dbName: string;
    readonly pvcName: string;
}

export class Postgresql extends Construct {
    serviceName: string;

    constructor(scope: Construct, id: string, options: PostgresqlOptions) {
        super(scope, id);

        const deployment = new kplus.StatefulSet(this, id, {
            replicas: 1,
            containers: [
                {
                    securityContext: {
                        ensureNonRoot: false, // TODO not safe but wont work without it
                        readOnlyRootFilesystem: false // TODO not safe but wont work without it
                    },
                    image: options.image,
                    portNumber: options.portNumber,
                    envVariables: {
                        'POSTGRES_USER': EnvValue.fromValue(options.user),
                        'POSTGRES_PASSWORD': EnvValue.fromValue(options.password),
                        'POSTGRES_DB': EnvValue.fromValue(options.dbName)
                    },
                },
            ],
            service: new Service(this, 'post-svc', {
                type: ServiceType.NODE_PORT,
                ports: [{port: options.portNumber, nodePort: options.nodePortNumber}]
            }),


        });

        // mount a volume based on the request to the container
        // this will also add the volume itself to the pod spec.
        deployment.containers[0].mount(
            '/var/lib/postgresql/data',
            kplus.Volume.fromPersistentVolumeClaim(
                this,
                `${id}-volume`,
                PersistentVolumeClaim.fromClaimName(this, `${options.pvcName}-volume`, options.pvcName)),
            {
                subPath: 'postgres'
            }
        );

        // db exposed as node service to one of the available host ports (30020)
        // const service = deployment.exposeViaService({
        //     ports: [{port: options.portNumber, nodePort: options.nodePortNumber}],
        //     serviceType: ServiceType.NODE_PORT
        // });

        this.serviceName = deployment.service.name;
    }
}
