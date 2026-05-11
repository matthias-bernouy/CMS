# Monitoring stack — deploy guide

Central observability for the Bernouy infra. Runs on a dedicated VPS,
scrapes the production nodes over the WireGuard mesh, exposes Grafana
publicly at `grafana.bernouy.com` behind Keycloak SSO.

Stack: Prometheus 2.55, Alertmanager 0.27, Grafana 11.3, Caddy 2.8.

## Prerequisites (in order)

1. **Monitoring VPS provisioned.** Recommended: OVH VPS-1 (4 GB / 80 GB),
   Debian 12 bookworm. Public ports `80` + `443` open. Public UDP `51820`
   open for WireGuard.
2. **DNS** `grafana.bernouy.com` A record → monitoring VPS public IP.
   Caddy uses HTTP-01 ACME on port 80 at first boot.
3. **WireGuard mesh up** — follow `docker/wireguard/README.md`. The
   monitoring VPS is node 10.10.0.1.
4. **Exporters running on every production VPS** — see
   `docker/_shared/exporters.DEPLOY.md`.
5. **Keycloak `grafana` client** created in the realm whose users should
   admin the dashboards. Setup:
   - Realm → Clients → Create client
   - Client ID: `grafana`
   - Client type: OpenID Connect
   - Capability: Standard flow ON, Direct access grants OFF
   - Valid Redirect URIs: `https://grafana.bernouy.com/login/generic_oauth`
   - Save → Credentials tab → copy the client secret
   - Realm roles → Create role `grafana-admin` (and optionally
     `grafana-editor`). Assign to relevant users.
6. **Discord/Slack webhook URL** ready. For Discord, append `/slack` to
   the webhook URL so Alertmanager's default payload renders correctly.

## Setup on the monitoring VPS

```bash
# 1. Get docker + compose plugin
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-plugin git

# 2. Pull this repo (or scp the docker/monitoring/ subtree). Easiest:
sudo mkdir -p /opt/cms-monitoring
sudo chown ubuntu:ubuntu /opt/cms-monitoring
cd /opt/cms-monitoring
# Either: clone the repo
git clone <repo-url> .
cd docker/monitoring
# Or: scp just the monitoring/ folder
#   scp -r docker/monitoring ubuntu@<monitoring-host>:/opt/cms-monitoring/

# 3. Configure environment
cp .env.example .env
nano .env    # fill in GRAFANA_DOMAIN, secrets, Keycloak issuer, webhook URL

# 4. (Optional) Pull community dashboards — see grafana/provisioning/dashboards/README.md
DST=grafana/provisioning/dashboards
curl -fsSL https://grafana.com/api/dashboards/1860/revisions/latest/download \
    | jq 'del(.id) | .uid = "node-exporter-full"' > "$DST/node-exporter-full.json"
curl -fsSL https://grafana.com/api/dashboards/14282/revisions/latest/download \
    | jq 'del(.id) | .uid = "cadvisor"' > "$DST/cadvisor.json"
sed -i 's/${DS_PROMETHEUS}/Prometheus/g' "$DST"/*.json

# 5. Bring it up
sudo docker compose --env-file .env up -d

# 6. Watch the first boot for ACME issuance
sudo docker compose logs -f caddy
# Expect "certificate obtained successfully" within ~30s. If it hangs,
# DNS isn't pointing here yet OR port 80 is blocked upstream.
```

## Verify

```bash
# Containers healthy
sudo docker compose ps

# Prometheus targets — should all be `up: 1`
sudo docker compose exec prometheus wget -qO- http://localhost:9090/api/v1/targets \
    | jq '.data.activeTargets[] | { job: .labels.job, instance: .labels.instance, health }'

# Alertmanager
sudo docker compose exec alertmanager wget -qO- http://localhost:9093/-/healthy

# Grafana public
curl -I https://grafana.bernouy.com/
```

Open `https://grafana.bernouy.com/` in a browser → "Sign in with
Keycloak" → land on the overview dashboard.

## Common surprises

- **Caddy can't issue cert** → DNS A record not propagated yet, or
  port 80 on the host blocked by the provider firewall. Caddy retries
  with exponential backoff; check `docker compose logs caddy`.

- **Grafana shows "Login failed: User does not have access"** → the
  Keycloak account doesn't have the `grafana-admin` / `grafana-editor`
  role assigned in the realm. With `role_attribute_strict: false`
  (default in our config), users without those roles get Viewer
  read-only access — not a hard block.

- **Prometheus targets show DOWN with timeout** → the exporter VPS
  isn't reachable over WireGuard. From the monitoring VPS:
  `ping 10.10.0.X` then `curl http://10.10.0.X:9100/metrics`. If ping
  fails, check `sudo wg show` on both ends.

- **Alerts not firing** → check `docker compose exec prometheus wget
  -qO- http://localhost:9090/api/v1/rules` for the rule evaluation
  state. Alertmanager: `wget -qO- http://localhost:9093/api/v2/alerts`.
  If they're firing internally but no Discord message arrives, the
  webhook URL is wrong (test with curl).

- **Disk filling on monitoring VPS** → likely Prometheus retention,
  default 30d. Trim via `PROMETHEUS_RETENTION=14d` in `.env` then
  `docker compose up -d` (a Prometheus restart prunes the TSDB to the
  new horizon).

## Updating

```bash
cd /opt/cms-monitoring/docker/monitoring
git pull
sudo docker compose --env-file .env pull
sudo docker compose --env-file .env up -d
```

Caddy / Prometheus / Grafana / Alertmanager all preserve their data
volumes across container replacements. The seed admin password env
var is ignored after the first boot.

## Operator access to Prometheus / Alertmanager directly

Both deliberately have no public surface. To poke at them:

```bash
# From your workstation:
ssh -L 9090:prometheus:9090 -L 9093:alertmanager:9093 ubuntu@<monitoring-host>
# Then open http://localhost:9090 and http://localhost:9093 locally.
```
