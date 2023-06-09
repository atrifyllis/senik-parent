import {Construct} from 'constructs';
import {Chart, Size} from 'cdk8s';
import {ChartProps} from "cdk8s/lib/chart";
import {KubeStorageClass} from "./imports/k8s";
import * as kplus from 'cdk8s-plus-25';
import {PersistentVolumeAccessMode} from 'cdk8s-plus-25';

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


        // TODO this is soooo ugly, but I could not find a way to keep the PVC created by grafana helm chart after helm uninstall...
        new kplus.PersistentVolumeClaim(this, `prom-grafana`, {
            storage: Size.gibibytes(2),
            accessModes: [
                PersistentVolumeAccessMode.READ_WRITE_ONCE
            ],
            storageClassName: 'local-path-retain'
        });
    }
}

// const app = new App({
//     yamlOutputType: YamlOutputType.FOLDER_PER_CHART_FILE_PER_RESOURCE
// });
// new StorageClassChart(app, 'snk-storage-class', {
//     disableResourceNameHashes: true
// });
// app.synth();
