import {Construct} from 'constructs';
import {App, Chart, YamlOutputType} from 'cdk8s';


import * as kplus from 'cdk8s-plus-25';
import {ChartProps} from "cdk8s/lib/chart";
import {Postgresql} from "./modules/postgresql";
import {KafkaServer} from "./modules/kafkaServer";
import {KafkaConnect} from "./modules/kafkaConnect";
import {KafkaUi} from "./modules/kafkaUi";
import {Tempo} from "./modules/tempo";
import {GrafanaDashboards} from "./modules/grafanaDashboards";
import {StorageClassChart} from "./storaceClass";


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
let appChart = new MyChart(app, 'snk', {
    disableResourceNameHashes: true
});
let storageClassChart = new StorageClassChart(app, 'snk-storage', {
    disableResourceNameHashes: true,
});
appChart.addDependency(storageClassChart);

app.synth();
