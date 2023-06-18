import {Construct} from 'constructs';
import {Chart, Size} from 'cdk8s';
import {ChartProps} from "cdk8s/lib/chart";
import {KubeStorageClass} from "./imports/k8s";
import * as kplus from 'cdk8s-plus-25';
import {PersistentVolumeAccessMode} from 'cdk8s-plus-25';

const SENIK_DB_PVC_NAME = 'senik-db-pvc';


export class StorageClassChart extends Chart {
    constructor(scope: Construct, id: string, props: ChartProps) {
        super(scope, id, props);

        new KubeStorageClass(this, 'local-path-retain', {
            metadata: {
                name: 'local-path-retain'
            },
            provisioner: 'rancher.io/local-path',
            reclaimPolicy: 'Retain',
            volumeBindingMode: 'WaitForFirstConsumer'
        });


        // TODO I could not find a way to keep the PVC created by grafana helm chart after helm uninstall...
        new kplus.PersistentVolumeClaim(this, `prom-grafana`, {
            storage: Size.gibibytes(2),
            accessModes: [
                PersistentVolumeAccessMode.READ_WRITE_ONCE
            ],
            storageClassName: 'local-path-retain'
        });
// TODO similarly, PVCs are created here because after a kubectl delete, and so a pvc delete, even if pvs
        // are retained, when pvc is recreated the old pvs are never bound to the pvcs. Instead new pv is created every time
        new kplus.PersistentVolumeClaim(this, SENIK_DB_PVC_NAME, {
            metadata: {
                name: SENIK_DB_PVC_NAME,
                finalizers: ['kubernetes.io/pvc-protection']
            },
            storage: Size.gibibytes(1),
            accessModes: [
                PersistentVolumeAccessMode.READ_WRITE_ONCE
            ],
            storageClassName: 'local-path-retain',
        });
    }
}
