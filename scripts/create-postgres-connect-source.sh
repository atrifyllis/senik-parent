#!/bin/sh


/docker-entrypoint.sh start &

echo "Waiting for Kafka Connect to start listening on kafka-connect"

# wait for connect to be healthy
while true
do
  curl_status=$(curl -s -o /dev/null -w %{http_code} http://localhost:8083/connectors)
  echo " Kafka Connect listener HTTP state: " "$curl_status" " (waiting for 200)"
  if [ "$curl_status" -eq 200 ] || [ "$curl_status" -eq 409 ] ; then
    break
  fi
  sleep 5
done
# register connector if not already registered

if [ "$curl_status" -eq 200 ] ; then

echo -e "\n--\n+> Creating Kafka Connect Postgres source"

 curl -X POST http://localhost:8083/connectors \
   -H 'Content-Type: application/json' \
   -H 'Accept: application/json' \
   -d @/scripts/senik_connector.json

fi

sleep infinity
