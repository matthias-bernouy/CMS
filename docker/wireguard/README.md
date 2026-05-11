# WireGuard mesh — monitoring overlay network

Self-hosted 4-node WireGuard mesh that carries Prometheus scrapes from the
monitoring VPS to the exporters on each production node. **Not** an internet
gateway — `AllowedIPs` only matches the `10.10.0.0/24` subnet, regular traffic
stays on the public interface.

```
10.10.0.1  monitoring  (Prometheus, Grafana, Alertmanager)
10.10.0.2  cms         (cms.bernouy.com — cms-control-mt + cms-delivery-mt)
10.10.0.3  cdn-origin  (cdn-origin.bernouy.com — cdn-node)
10.10.0.4  cdn-edge    (cdn.bernouy.com — openresty edge)
```

Each node holds its own private key and the public keys of the three others.
Add a node → re-run `generate-mesh.sh` with one more entry → re-distribute
`wg0.conf` to all peers (or `wg set` the new peer ad-hoc on each existing
node, keys preserved).

## Prerequisites

On the operator machine (where you'll run the generator):

- `wireguard-tools` package (`apt install wireguard-tools` — provides `wg`).
- SSH access to all 4 VPS with sudo.

On each VPS:

- `wireguard` kernel module (built into the kernel since 5.6 — Debian
  bookworm OK out of the box).
- `wireguard-tools` package for `wg-quick`.
- UDP port `51820` open in any provider-level firewall (OVH IP block etc.).

## Setup

```bash
cd docker/wireguard

# Fill these with the public IPs of your 4 VPS:
export VPS_IP_MONITORING=51.x.x.x
export VPS_IP_CMS=162.19.255.149
export VPS_IP_CDN_ORIGIN=51.91.77.195
export VPS_IP_CDN_EDGE=51.x.x.x

./generate-mesh.sh
```

Outputs 4 files under `out/`:
```
out/monitoring.wg0.conf
out/cms.wg0.conf
out/cdn-origin.wg0.conf
out/cdn-edge.wg0.conf
```

Then per-VPS:

```bash
# Example for the monitoring node:
scp out/monitoring.wg0.conf ubuntu@<monitoring-host>:/tmp/wg0.conf
ssh ubuntu@<monitoring-host> '
    sudo apt-get update && sudo apt-get install -y wireguard-tools
    sudo install -m 0600 /tmp/wg0.conf /etc/wireguard/wg0.conf
    rm /tmp/wg0.conf
    sudo systemctl enable --now wg-quick@wg0
'
```

Repeat for cms, cdn-origin, cdn-edge with the matching file.

## Verify

From the monitoring VPS:

```bash
ping -c2 10.10.0.2   # cms
ping -c2 10.10.0.3   # cdn-origin
ping -c2 10.10.0.4   # cdn-edge
sudo wg show         # see peer handshakes + last-handshake age
```

Each peer line should show a `latest handshake: <recent timestamp>`. If
some show `latest handshake: never`, the public UDP port `51820` is
blocked upstream — check the provider firewall for that VPS.

## Security notes

- Private keys never leave the operator machine and the target VPS.
  Generated configs in `out/` are chmod 0600. Delete them after
  distribution (`rm -rf out/`).
- `out/` is gitignored — never commit the generated configs.
- Rotate keys yearly or after any operator workstation compromise:
  re-run `generate-mesh.sh`, re-distribute all 4 configs (mesh
  rotates atomically since every node gets its new privkey + peers).
- The mesh carries traffic **only** between the 10.10.0.x peers; regular
  internet traffic on each VPS continues on `eth0`. The mesh has no
  default route.

## Troubleshooting

- `wg-quick@wg0` fails to start → check `journalctl -u wg-quick@wg0`.
  Most common cause: another service already on port 51820, or the
  `wireguard` kernel module not loaded (`sudo modprobe wireguard`).
- `ping 10.10.0.x` succeeds but Prometheus scrape times out → check the
  exporter is binding on the wg0 IP (not just 127.0.0.1) and that the
  VPS-local firewall (iptables / ufw) allows traffic on the wg0 interface.
- One peer stops responding → `sudo wg show` on both ends. If
  `latest handshake` is stuck, restart wg-quick: `sudo systemctl restart
  wg-quick@wg0`.
