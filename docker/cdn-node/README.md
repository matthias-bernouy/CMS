# `bernouy/cdn-origin`

The control-plane / write-side node of a CDN cluster. Wraps the
all-in-one `cdn-keycloak` feature set with edge management on top:

- Holds the authoritative copy of `/var/lib/cdn/buckets`.
- Exposes the admin / upload / broker APIs on `https://<MAIN_DOMAIN>`.
- Pushes blob changes to every registered edge via **lsyncd over SSH**.
- Issues TLS certs (DNS-01 single-host for `<MAIN_DOMAIN>` + HTTP-01 per
  client alias). Edges serve them; their renewal stays here.
- Is **NOT** in the public DNS round-robin: edges serve the public
  bucket sub-domains. The origin is reachable only on its own admin
  hostname.

> **Naming note** — "origin" / "edge" follow standard CDN terminology:
> the origin is the source of truth, the edges are the public-facing
> nodes. The word "shard" stays free for a future logical concept (a
> bounded data partition, e.g. ~10 GB, that can be moved between
> origins quickly).

## Topology

```
                         ┌──────── ACME HTTP-01 ────────┐
                         │                              │
                         ▼                              │
   public ──► *.cdn.example.com (DNS RR)                │
                  │                                     │
                  ├──► cdn-edge @ region A ─────────────┤
                  ├──► cdn-edge @ region B ─────────────┤
                  └──► cdn-edge @ region C ─────────────┤
                                  ▲                     │
                                  │ lsyncd push (rsync) │
                                  │                     │
   admin/ops ──► cdn-origin.example.com ───► cdn-ORIGIN (this image)
```

The origin's hostname (`MAIN_DOMAIN` here) is **not** the same as the
public CDN host. Recommended naming: public is `cdn.example.com`,
origin is `cdn-origin.example.com` (or kept on a private/internal DNS
zone if you front it with a VPN / mesh).

## Required env vars

| Var                       | Purpose                                                                                  |
|---------------------------|------------------------------------------------------------------------------------------|
| `MAIN_DOMAIN`             | Admin host of the origin, e.g. `cdn-origin.example.com`. Cert via DNS-01 or HTTP-01.     |
| `PUBLIC_DOMAIN`           | Host the edges round-robin on, e.g. `cdn.example.com`. Cert via HTTP-01 webroot through edges. |
| `LEGO_EMAIL`              | ACME account email (registered on first boot).                                           |
| `MONGO_URL`               | External MongoDB URL (Atlas / self-hosted).                                              |
| `CDN_BUCKETS_KEK`         | Base64 of 32 random bytes (`openssl rand -base64 32`). Encrypts the per-bucket DEKs which encrypt proxy auth secrets. **Loss = all proxy auths unrecoverable.** |
| `KEYCLOAK_ISSUER`         | OIDC issuer URL.                                                                         |
| `KEYCLOAK_CLIENT_ID`      | OIDC client id registered in Keycloak.                                                   |
| `KEYCLOAK_CLIENT_SECRET`  | OIDC client secret.                                                                      |
| `KEYCLOAK_SESSION_SECRET` | HMAC key for the local session cookie. **At least 32 random chars.**                     |

## Optional env vars

| Var                       | Default                                | Purpose                                                                |
|---------------------------|----------------------------------------|------------------------------------------------------------------------|
| `LEGO_DNS_PROVIDER`       | (unset)                                | Set to `ovh` / `route53` / etc. to mint `MAIN_DOMAIN` via DNS-01 instead of HTTP-01 standalone. Provider creds (`OVH_*`, `AWS_*`…) must accompany. |
| `<DNS>_*`                 | -                                      | Provider-specific creds, forwarded to lego when `LEGO_DNS_PROVIDER` is set. |
| `KEYCLOAK_ADMIN_ROLE`     | `admin`                                | Keycloak realm role mapped to the admin role.                          |
| `PORT`                    | `3000`                                 | Internal Bun port; nginx upstreams here.                               |
| `MONGO_DB_NAME`           | `cdn`                                  | DB name on the Mongo cluster.                                          |
| `SSH_KEY_PATH`            | `/var/lib/cdn/ssh/id_ed25519`          | Origin's private key used by lsyncd + probes.                          |
| `LSYNCD_CONFIG_PATH`      | `/etc/lsyncd/lsyncd.conf.lua`          | Where the generator writes the lua config.                             |
| `LSYNCD_STATUS_PATH`      | `/var/lib/cdn/lsyncd/status`           | lsyncd status snapshot (read by the dashboard).                        |
| `LSYNCD_LOG_PATH`         | `/var/lib/cdn/lsyncd/lsyncd.log`       | lsyncd log file.                                                       |
| `LSYNCD_DISABLED`         | `false`                                | Skip the lsyncd supervisor entirely (dev / single-node mode).          |
| `BACKUP_DISABLED`         | `false`                                | Skip the daily backup loop.                                            |
| `BACKUP_TIME`             | `03:00`                                | UTC time of the daily backup run.                                      |
| `BACKUP_SKIP_MONGO`       | `false`                                | Skip mongodump (Atlas already snapshots).                              |
| `BACKUP_RCLONE_REMOTE`    | (unset)                                | rclone remote for off-site copies.                                     |

## Volumes

```
/var/lib/cdn/
├── buckets/         origin copy of every bucket — lsynced to edges
├── lego/            cert store + ACME challenge webroot
├── ssh/             id_ed25519 keypair generated on first boot
├── lsyncd/          status + log files
└── backups/         local backup output before rclone (cf. cdn-backup.sh)
```

## Admin + edge surface

Once running, browse to `https://<MAIN_DOMAIN>/`:

- `/admin/buckets`              — bucket CRUD (from `@bernouy/cdn-buckets`).
- `/admin/api/proxies/*`        — proxy CRUD across all buckets (superadmin override).
- `/admin/origin/`              — origin dashboard (edges, lsyncd status, SSH pubkey).
- `/admin/origin/edges`         — edge CRUD (add, probe, remove).
- `/admin/origin/api/*`         — JSON API behind those pages.

Bucket-scoped surfaces (per bucket, auth via `bucketCredential`):

- `/api/proxies` (POST / DELETE) — the `BucketProxyPublisher` of each
  CMS tenant POSTs here when a Data Provider is saved. The bucket scope
  is taken from the credential, not the URL. See `@bernouy/cdn-buckets`
  for the full broker surface.

Edge-facing surface (auth via `EDGE_TOKEN`):

- `/edge-api/secrets` (GET, conditional on `If-None-Match`) — returns
  the `{ etag, manifest: { SECRET_xxx: plaintext } }` for the entire
  cluster. Each edge polls every `SECRETS_POLL_INTERVAL` seconds (10s
  default) and reloads nginx with the new substitutions.

Adding an edge is fully covered in
[`../cdn-edge/DEPLOY.md`](../cdn-edge/DEPLOY.md): bootstrap host with
`init-server.sh --role edge`, paste the origin pubkey on the host,
register the edge in the admin UI (the "+ Add edge" form pops a modal
with the plaintext bearer token — copy it once), drop the token into
the edge's OKMS bundle as `EDGE_TOKEN`, then run the container.

## Deployment

See [DEPLOY.md](DEPLOY.md) for the prod deployment runbook.

## Caveats

- **First boot needs `LEGO_DNS_PROVIDER`** to mint the origin's own cert.
  After that, you can drop it (the cert is renewed via DNS-01 on the
  daily loop and the per-alias HTTP-01 path doesn't need it).
- **Mongo is external.** A failed Mongo connection at boot kills the
  container; the daily backup also fails until Mongo is back.
- **lsyncd lag.** Pushes are coalesced with a 5s delay (lsyncd's
  `delay` setting). Public reads on a brand-new file may briefly miss
  the edges until the next rsync cycle (typically <10s). Acceptable
  for static-CDN workloads; not appropriate as a synchronous KV store.
- **No HTTP-01 from the origin itself.** The origin's hostname is not
  in the public DNS, so any cert issuance for `<MAIN_DOMAIN>` must use
  DNS-01 (provider creds required). Per-alias certs are HTTP-01,
  validated through the edges' nginx proxying back here.
