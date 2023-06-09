import {Construct} from "constructs";
import * as kplus from "cdk8s-plus-25";



export class GrafanaDashboards extends Construct {
    constructor(scope: Construct, id: string) {
        super(scope, id);

        let kafkaDashboardsConfigMap = new kplus.ConfigMap(this, 'kafka-dashboards', {
            metadata: {
                labels: {
                    'grafana_dashboard': '1'
                },
                annotations: {
                    "grafana_folder": "/tmp/dashboards/kafka"
                }
            }
        });
        kafkaDashboardsConfigMap.addFile('../obs/dashboards/new/strimzi-kafka-exporter.json', 'strimzi-kafka-exporter.json');


        let kafkaDashboardsConfigMap2 = new kplus.ConfigMap(this, 'kafka-dashboards2', {
            metadata: {
                labels: {
                    'grafana_dashboard': '1'
                },
                annotations: {
                    "grafana_folder": "/tmp/dashboards/kafka"
                }
            }
        });

        kafkaDashboardsConfigMap2.addFile('../obs/dashboards/new/strimzi-kafka.json', 'strimzi-kafka.json');

        let kafkaDashboardsConfigMap3 = new kplus.ConfigMap(this, 'kafka-dashboards3', {
            metadata: {
                labels: {
                    'grafana_dashboard': '1'
                },
                annotations: {
                    "grafana_folder": "/tmp/dashboards/kafka"
                }
            }
        });

        kafkaDashboardsConfigMap3.addFile('../obs/dashboards/new/strimzi-kafka-connect.json', 'strimzi-kafka-connect.json');

        let springDashboardsConfigMap = new kplus.ConfigMap(this, 'spring-dashboards', {
            metadata: {
                labels: {
                    'grafana_dashboard': '1'
                },
                annotations: {
                    "grafana_folder": "/tmp/dashboards/spring"
                }
            }
        });
        springDashboardsConfigMap.addFile('../obs/dashboards/new/spring-boot-hikaricp-jdbc_rev5.json', 'hikari-dashboard.json')

        let springDashboardsConfigMap2 = new kplus.ConfigMap(this, 'spring-dashboards2', {
            metadata: {
                labels: {
                    'grafana_dashboard': '1'
                },
                annotations: {
                    "grafana_folder": "/tmp/dashboards/spring"
                }
            }
        });
        springDashboardsConfigMap2.addFile('../obs/dashboards/new/spring-boot-observability_rev1.json', 'spring-boot-dashboard.json')

        let springDashboardsConfigMap3 = new kplus.ConfigMap(this, 'spring-dashboards3', {
            metadata: {
                labels: {
                    'grafana_dashboard': '1'
                },
                annotations: {
                    "grafana_folder": "/tmp/dashboards/spring"
                }
            }
        });
        springDashboardsConfigMap3.addFile('../obs/dashboards/new/jvm-micrometer_rev9.json', 'jvm-micrometer_rev9.json')

        // kafkaDashboardsConfigMap.addFile('../obs/dashboards/new/logs_traces_metrics.json', 'logs_traces_metrics.json')
    }
}
