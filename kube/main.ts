import {Construct} from 'constructs';
import {App, Chart, Size, YamlOutputType} from 'cdk8s';


import * as kplus from 'cdk8s-plus-25';
import {PersistentVolumeAccessMode} from 'cdk8s-plus-25';
import {ChartProps} from "cdk8s/lib/chart";
import {Postgresql} from "./modules/postgresql";
import {KafkaServer} from "./modules/kafkaServer";
import {KafkaConnect} from "./modules/kafkaConnect";
import {KafkaUi} from "./modules/kafkaUi";
import {Tempo} from "./modules/tempo";
import {KubeStorageClass} from "./imports/k8s";
import {GrafanaDashboards} from "./modules/grafanaDashboards";


const SENIK_DB_PORT = 5432;
const SENIK_DB_NODE_PORT = 30020;

const KAFKA_INTERNAL_PORT = 9092;
const KAFKA_NODE_PORT = 30019;
const KAFKA_METRICS_CONFIG_KEY = 'kafka-metrics-config.yaml';
const KAFKA_CONNECT_METRICS_CONFIG_KEY = 'kafka-connect-metrics-config.yaml';

const KAFKA_UI_LOCAL_ADDRESS = 'kafka-ui.127.0.0.1.nip.io';

const TEMPO_ZIPKIN_NODE_PORT = 30017;

export class MyChart extends Chart {
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

        // TODO this is soooo ugly, but I could not find a way to keep the PVC created by grafan helm chart after helm uninstall...
        new kplus.PersistentVolumeClaim(this, `prom-grafana`, {
            storage: Size.gibibytes(2),
            accessModes: [
                PersistentVolumeAccessMode.READ_WRITE_ONCE
            ],
            storageClassName: 'local-path-retain'
        });

        let senikDb = new Postgresql(this, 'senik-db', {
            image: 'debezium/postgres:14',
            portNumber: SENIK_DB_PORT,
            user: 'senik',
            password: 'senik',
            dbName: 'senik',
            nodePortNumber: SENIK_DB_NODE_PORT
        });


        // without the rules in this configmap the strimzi-kafka dashboard does not work!
        let kafkaPrometheusConfigMap = new kplus.ConfigMap(this, 'kafka-prom-configmap', {});
        kafkaPrometheusConfigMap.addFile('../obs/kafka-metrics.yaml', KAFKA_METRICS_CONFIG_KEY);


        let kafkaConnectPrometheusConfigMap = new kplus.ConfigMap(this, 'kafka-connect-prom-configmap', {});
        kafkaConnectPrometheusConfigMap.addFile('../obs/connect-metrics.yaml', KAFKA_CONNECT_METRICS_CONFIG_KEY);

        const kafka = new KafkaServer(this, 'kafka-cluster', {
            internalPort: KAFKA_INTERNAL_PORT,
            externalPort: 9093,
            nodePort: KAFKA_NODE_PORT,
            metricsConfigMapName: kafkaPrometheusConfigMap.name,
            metricsConfigMapKey: KAFKA_METRICS_CONFIG_KEY
        });



        new GrafanaDashboards(this, 'grafana-dashboards');


        let kafkaBootstrapServers = `${kafka.name}-kafka-bootstrap:${KAFKA_INTERNAL_PORT}`;

        let kafkaConnect = new KafkaConnect(this, 'kafka-connect-cluster', {
            image: 'otinanism/strimzi-connect',
            kafkaBootstrapServers: kafkaBootstrapServers,
            name: 'senik-debezium',
            connectorId: 'postgres-sink-kafka-connector',
            connectorName: 'senik-outbox-connector',
            dbHost: senikDb.serviceName,
            dbPort: SENIK_DB_PORT,
            dbUser: 'senik',
            dbPassword: 'senik',
            dbName: 'senik',
            outboxTopic: 'senik.events',
            metricsConfigMapName:  kafkaConnectPrometheusConfigMap.name,
            metricsConfigMapKey: KAFKA_CONNECT_METRICS_CONFIG_KEY
        });

        let kafkaConnectAddress = `http://${kafkaConnect.name}-connect-api:8083`;

        new KafkaUi(this, 'kafka-ui', {
            kafkaBootstrapServers: kafkaBootstrapServers,
            kafkaConnectName: kafkaConnect.name,
            kafkaConnectAddress: kafkaConnectAddress,
            kafkaUiAddress: KAFKA_UI_LOCAL_ADDRESS
        });

        new Tempo(this, 'tempo', {
            zipkinNodePort: TEMPO_ZIPKIN_NODE_PORT,
            configFilePath: '../obs/tempo-config.yaml'
        });

    }
}

const app = new App({
    yamlOutputType: YamlOutputType.FOLDER_PER_CHART_FILE_PER_RESOURCE
});
new MyChart(app, 'snk', {
    disableResourceNameHashes: true
});
app.synth();
