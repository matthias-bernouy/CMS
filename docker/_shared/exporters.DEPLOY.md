# Exporters deploy — per-VPS sidecar

For every production VPS that should appear on the Grafana dashboards
(cms, cdn-origin, cdn-edge).

## Prerequisites

- WireGuard mesh up (`docker/wireguard/`). The exporters bind on the
  node's `10.10.0.X` address and will fail to start if `wg0` isn't there.
- Docker + Docker Compose plugin installed on the VPS.

## Setup

```bash
# On the operator machine, copy the compose file + env template:
scp docker/_shared/exporters.compose.yml ubuntu@<host>:/tmp/
scp docker/_shared/exporters.env.example ubuntu@<host>:/tmp/

# On the VPS:
sudo mkdir -p /etc/cms-monitoring
sudo mv /tmp/exporters.compose.yml /etc/cms-monitoring/
sudo mv /tmp/exporters.env.example /etc/cms-monitoring/.env

# Edit the .env to set the right WG_IP (the wg0 address of THIS node):
sudo nano /etc/cms-monitoring/.env

# Start:
sudo docker compose --env-file /etc/cms-monitoring/.env \
                    -f /etc/cms-monitoring/exporters.compose.yml \
                    up -d
```

## Verify

From the monitoring VPS (10.10.0.1):

```bash
curl -s http://10.10.0.X:9100/metrics | head     # node_exporter
curl -s http://10.10.0.X:8080/healthz            # cAdvisor
```

Both should return successfully. From the public internet:

```bash
curl -m3 http://<public-ip>:9100/metrics  # MUST time out / refuse
curl -m3 http://<public-ip>:8080/healthz  # MUST time out / refuse
```

If the public probes succeed, the bind address isn't `10.10.0.X` — check
the compose file's `command` section + the `.env` `WG_IP`.

## Auto-start on boot

The compose has `restart: unless-stopped`, so Docker brings them back up
after a host reboot. Confirm with `sudo docker ps` after a reboot.

## Update / rotate

```bash
sudo docker compose --env-file /etc/cms-monitoring/.env \
                    -f /etc/cms-monitoring/exporters.compose.yml \
                    pull
sudo docker compose --env-file /etc/cms-monitoring/.env \
                    -f /etc/cms-monitoring/exporters.compose.yml \
                    up -d
```

## Troubleshooting

- `node-exporter` exits with "address not available" → the WG_IP in
  `.env` doesn't match what wg0 has assigned. Check `ip addr show wg0`.
- cAdvisor 500s on `/healthz` → kernel cgroup v2 quirks, usually
  resolved by re-pulling a newer cAdvisor tag.
- High CPU from cAdvisor → reduce the `--disable_metrics` list (already
  trimmed in the compose; trim further if needed).
