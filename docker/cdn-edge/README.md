# `bernouy/cdn-edge`

The public-serving node of a CDN cluster. Headless on purpose — just
**OpenResty** (nginx + LuaJIT) + a small secrets-poll loop. **No app,
no DB, no Keycloak.** sshd is host-side (port 22), not in the container.

- Receives blobs + certs + nginx fragments from the **origin** via
  lsyncd-over-SSH (origin → host's sshd → bind-mount into container).
- Serves `<PUBLIC_DOMAIN>` (e.g. `cdn.bernouy.com`) on HTTPS with
  gzip pre-compression. Brotli is temporarily disabled (not bundled
  by upstream OpenResty); add `lua-resty-brotli` if perf demands it.
- Proxies `/.well-known/acme-challenge/*` to the origin so HTTP-01
  validation works for both `<PUBLIC_DOMAIN>` itself and per-alias certs.
- Polls `https://<MAIN_DOMAIN>/edge-api/secrets` every 10s with its
  bearer `EDGE_TOKEN` to fetch the proxy-secrets manifest. Writes the
  raw JSON body to `/run/cdn-edge/secrets.json` (tmpfs) and triggers
  `nginx -s reload` on ETag change. The `init_by_lua_block` in
  `nginx.conf` re-reads the file at each reload and populates the
  global `cms_secrets` Lua table — per-location `set_by_lua_block`
  directives consume it. **Plaintext never lands on persistent disk.**
- Reloads nginx automatically when lsyncd pushes a new cert or a new
  generated fragment (inotify watcher).

## Auth model

- **Inbound HTTP/HTTPS** is public — no auth.
- **Inbound SSH** — pubkey only, single user `cdn-sync`, no password,
  no root. The single authorized key is the **origin's** `id_ed25519.pub`.
- **Outbound `/edge-api/secrets`** — bearer JWT-like token (`bsedge_xxx`)
  issued by the origin admin UI when the edge is registered. Lookup via
  `tokenHash` on the origin's `EdgeRepository`.
- The edge has **no admin UI** — every operator action is driven from
  the origin's `https://<MAIN_DOMAIN>/admin/origin/`.

## Required env vars

| Var                          | Purpose                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `PUBLIC_DOMAIN`              | Public host the edge serves (e.g. `cdn.bernouy.com`). Same value across all edges of the cluster. Determines the cert filename and the round-robin DNS target. |
| `ORIGIN_HOST`                | Hostname of the origin reachable over plain HTTP/80 — used for the ACME challenge proxy_pass and the `/edge-api/secrets` poll. |
| `EDGE_ID`                    | Unique id of this edge in the origin's registry (e.g. `edge-fr-1`). Must match the `id` field used in the `+ Add edge` form. Used in nginx access logs for log aggregation. |
| `EDGE_TOKEN`                 | Bearer token (`bsedge_xxx`) returned **once** by the origin's `POST /admin/origin/api/edges` response. Used to authenticate against `/edge-api/secrets`. Lost token = delete + recreate the edge in the admin. Alternatively mount as `/run/secrets/edge-token`. |

## Optional env vars

| Var                          | Default | Purpose                                                                |
|------------------------------|---------|------------------------------------------------------------------------|
| `WAIT_FOR_CERT_SECONDS`      | `1800`  | Max seconds the entrypoint waits for the `<PUBLIC_DOMAIN>` cert to land via lsyncd before giving up. |
| `RELOAD_DEBOUNCE_SECONDS`    | `5`     | inotify debounce window for the cert-reload watcher.                   |
| `SECRETS_POLL_INTERVAL`      | `10`    | Seconds between `/edge-api/secrets` polls.                             |
| `ORIGIN_SCHEME`              | `https` | Scheme for the secrets poll. Set to `http` only for dev.               |

## Volumes

```
/var/lib/cdn/    bind-mounted from the host (NOT a named volume) — same
                 path that lsyncd-from-origin writes into via the host's
                 sshd as user cdn-sync (UID/GID 1099, aligned with the
                 container's matching cdn-sync so nginx reads cleanly).
├── buckets/             rsynced from origin
├── lego/certificates/   rsynced from origin (PUBLIC_DOMAIN cert + per-alias certs)
├── nginx-generated/     rsynced from origin (alias maps, cache-control, 404 fallback,
│                        aliasesServers.conf — ready-to-use OpenResty config with
│                        set_by_lua_block + cms_secrets[...] references, no envsubst)
└── access-logs/         JSON-Lines access log + rotated archives (origin pulls these)
```

In RAM only (tmpfs, never disk):
```
/run/cdn-edge/.secrets-etag   last seen ETag from /edge-api/secrets
/run/cdn-edge/secrets.json    raw manifest body { etag, manifest: { SECRET_X: cleartext } }
                              read by init_by_lua_block at every nginx reload to
                              populate the cms_secrets Lua table; never on disk
```

## Topology recap

```
public ─► cdn.bernouy.com (DNS RR)
            │
            ▼
       cdn-edge  ◄── lsyncd push (rsync over SSH)  ─── cdn-origin
            │           ▲
            │           │
            └─► /.well-known/acme-challenge/  ─proxy_pass─►  cdn-origin
            │
            └─► /edge-api/secrets (poll, bearer EDGE_TOKEN)  ─►  cdn-origin
```

## Deployment

See [DEPLOY.md](DEPLOY.md). High-level:

1. `init-server.sh --role edge --origin-ip <ip-origin>` on a fresh VPS
   (apt + Docker + ufw + creates `cdn-sync` user UID/GID 1099 on host).
2. Paste the origin's pubkey into `~cdn-sync/.ssh/authorized_keys` on
   the host (with a `from="<ip-origin>"` clause).
3. **Register the edge in the origin admin UI** (`+ Add edge`) and copy
   the `plaintextToken` from the post-create modal.
4. Provision the edge's OKMS bundle (`prod/cdn-edge/<edge-id>/config`)
   with `PUBLIC_DOMAIN`, `ORIGIN_HOST`, `EDGE_ID`, `EDGE_TOKEN`.
5. `docker run -d -p 80:80 -p 443:443 -v /var/lib/cdn:/var/lib/cdn …`
   — bind-mount the host's `/var/lib/cdn` into the container.
6. Wait for the lsyncd init pass (entrypoint blocks in bootstrap mode
   until the cert lands — typically <1 min on a fresh cluster).
7. Add the VPS's IP to the public DNS round-robin for `<PUBLIC_DOMAIN>`.

## Caveats

- **No standalone serving** — without an origin to push it the
  `<PUBLIC_DOMAIN>` cert + the buckets, the edge can't reach `:443`
  (entrypoint blocks). Intentional: a half-empty edge would 404 every
  request, worse than staying out of the rotation.
- **inotify in container layers**. Some Docker storage drivers (older
  overlayfs, devicemapper) drop inotify events on bind-mounted volumes.
  We're watching a real volume — should work, but if reloads stop
  firing after a `lsyncd kick`, fall back to a 1-day cron.
- **Per-alias cert reload after issuance** — when the origin issues a
  new alias cert via lego HTTP-01, the cert lands on the edge through
  lsyncd in seconds, the inotify watcher reloads nginx automatically.
  Allow a 10-30s window between "issue" and "alias serves the new cert".
- **Plaintext secrets in nginx config + RAM** — the proxy auth secrets
  live in clear in `/run/cdn-edge/.secrets-env` (tmpfs) and in the
  loaded nginx config. Nothing on disk. The `EDGE_TOKEN` itself is in
  the container env / `/run/secrets/edge-token`.
