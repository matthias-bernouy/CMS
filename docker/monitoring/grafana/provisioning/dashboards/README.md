# Grafana dashboards

`overview.json` is the home dashboard, custom-built for this stack
(host stats + per-container snapshot). It loads automatically via the
provisioning config.

## Adding the standard community dashboards

Two well-known dashboards complement the overview:

- **Node Exporter Full** (id `1860`) — every host metric, drillable per CPU/disk/network/interface.
- **cAdvisor / Docker Containers** (id `14282`) — per-container CPU, memory, network, filesystem.

To pull them at deploy time (run on the monitoring VPS, in this folder):

```bash
DST=docker/monitoring/grafana/provisioning/dashboards
curl -fsSL https://grafana.com/api/dashboards/1860/revisions/latest/download \
    | jq 'del(.id) | .uid = "node-exporter-full"' \
    > "$DST/node-exporter-full.json"
curl -fsSL https://grafana.com/api/dashboards/14282/revisions/latest/download \
    | jq 'del(.id) | .uid = "cadvisor"' \
    > "$DST/cadvisor.json"

# Patch the datasource placeholder both files use:
sed -i 's/${DS_PROMETHEUS}/Prometheus/g' "$DST"/*.json
```

Then `docker compose restart grafana` (the provisioner picks up new
files at boot or every 30s once running).

These two JSONs are NOT committed because they're large (~50KB each)
and tied to a specific revision; pulling at deploy keeps the repo lean
and lets you grab newer revisions later.
