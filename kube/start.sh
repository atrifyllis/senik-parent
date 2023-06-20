#! /bin/bash

helm install prom prometheus-community/kube-prometheus-stack --values ../obs/prom-stack-values.yaml --namespace prom --create-namespace

helm install strimzi-operator strimzi/strimzi-kafka-operator

kubectl apply -f strimzi-pod-monitor.yaml

#helm install loki grafana/loki --values ../obs/loki-values.yaml

kubectl apply -f dist/0000-snk-storage
kubectl apply -f dist/0001-snk
