# `bernouy/cdn-edge`

The public-serving node of a CDN cluster. Headless on purpose — just
nginx (with brotli) + sshd. **No app, no DB, no Keycloak.**

- Receives blobs + certs + nginx fragments from the **origin** via
  lsyncd-over-SSH.
- Serves `*.<MAIN_DOMAIN>` on HTTPS with brotli/gzip pre-compression.
- Proxies `/.well-known/acme-challenge/*` to the origin so per-alias
  HTTP-01 cert issuance keeps working without DNS-01 creds on the edge.
- Reloads nginx automatically when lsyncd pushes a new cert or a new
  generated fragment (inotify watcher).

## Auth model

- **Inbound HTTP/HTTPS** is public — no auth.
- **Inbound SSH (TCP/22)** — pubkey only, single user `cdn-sync`,
  no password, no root, no shell-of-last-resort. The single
  authorized key is the **origin's** `id_ed25519.pub`.
- The edge has **no admin UI** — every operator action is driven from
  the origin's `https://<MAIN_DOMAIN>/admin/origin/`.

## Required env vars

| Var                          | Purpose                                                                                              |
|------------------------------|------------------------------------------------------------------------------------------------------|
| `MAIN_DOMAIN`                | Same value as on the origin (e.g. `cdn.example.com`). Determines `*.<MAIN_DOMAIN>` and the wildcard cert filename. |
| `ORIGIN_HOST`                | Hostname of the origin reachable over plain HTTP (port 80) — used for the ACME challenge proxy_pass. |
| `AUTHORIZED_ORIGIN_PUBKEY`   | Origin's `id_ed25519.pub` line, **ONE-TIME on first boot**. Persisted to `~cdn-sync/.ssh/authorized_keys` on the volume. Drop after first run. |

## Optional env vars

| Var                          | Default | Purpose                                                                |
|------------------------------|---------|------------------------------------------------------------------------|
| `WAIT_FOR_CERT_SECONDS`      | `600`   | Max seconds the entrypoint waits for the wildcard cert to land via lsyncd before giving up. |
| `RELOAD_DEBOUNCE_SECONDS`    | `5`     | inotify debounce window for the cert-reload watcher.                   |

## Volumes

```
/var/lib/cdn/
├── buckets/             rsynced from origin
├── lego/certificates/   rsynced from origin (wildcard + per-alias certs)
├── nginx-generated/     rsynced from origin (alias maps, cache-control, 404 fallback)
├── sshd/                persisted host keys (so origin's known_hosts stays valid)
└── (nothing else — cf. excludes in origin's lsyncd config)
```

## Topology recap

```
public ─► *.cdn.example.com (DNS RR)
            ▼
       cdn-edge (this image)  ◄── lsyncd push (rsync over SSH)  ─── cdn-origin
            │
            └─► /.well-known/acme-challenge/  ──proxy_pass──►  cdn-origin
```

## Deployment

See [DEPLOY.md](DEPLOY.md). The high-level steps:

1. Spin up a clean VPS (any Linux + Docker).
2. Open the firewall: 22 (SSH from origin's IP), 80 + 443 (public).
3. Get the origin's pubkey from `https://<MAIN_DOMAIN>/admin/origin/`.
4. `docker run -d -e AUTHORIZED_ORIGIN_PUBKEY="ssh-ed25519 …" …`
5. From the origin's UI: **+ Add edge** with the new VPS's hostname.
6. Wait for the lsyncd init pass (entrypoint waits up to 10 min).
7. Add the VPS's IP to the public DNS round-robin for `*.<MAIN_DOMAIN>`.

## Caveats

- **No standalone serving** — without an origin to push it the wildcard
  cert + the buckets, the edge can't start nginx (entrypoint blocks).
  Intentional: a half-empty edge would 404 every request, worse than
  staying out of the rotation.
- **inotify in container layers**. Some Docker storage drivers (older
  overlayfs, devicemapper) drop inotify events on bind-mounted volumes.
  We're watching a real volume — should work, but if reloads stop
  firing after a `lsyncd kick`, fall back to a 1-day cron.
- **Per-alias cert reload after issuance** — when the origin issues a
  new alias cert via lego HTTP-01, the cert file lands here through
  lsyncd in seconds, the inotify watcher reloads nginx automatically.
  No manual step required, but allow a 10-30s window between "issue"
  and "alias serves the new cert".
