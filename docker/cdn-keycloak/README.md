# `bernouy/cdn-keycloak` — turnkey all-in-one CDN with Keycloak auth

Single container bundling **everything** needed to run a CDN:
- Bun + the cdn lib
- MongoDB (loopback-only)
- Nginx (HTTP + HTTPS, public bucket serving, alias servers)
- lego (TLS provisioning + renewal)
- Keycloak OIDC consumer (admin auth)

Just set env vars and `docker run`. Single mounted volume carries the
mongo data, blob storage, and TLS cert store.

## Required env vars

| Var                       | Purpose                                                                                          |
|---------------------------|--------------------------------------------------------------------------------------------------|
| `MAIN_DOMAIN`             | e.g. `cdn.example.com`. The wildcard cert covers `*.<MAIN_DOMAIN>` for bucket sub-domains.       |
| `LEGO_EMAIL`              | ACME account email (registered on first boot).                                                   |
| `LEGO_DNS_PROVIDER`       | lego DNS provider id (`ovh`, `route53`, `cloudflare`, …) — required for the wildcard cert.       |
| `<DNS>_*`                 | Provider-specific credentials, forwarded to lego (and to per-alias issuance).                    |
| `KEYCLOAK_ISSUER`         | OIDC issuer URL, e.g. `https://auth.example.com/realms/main`.                                    |
| `KEYCLOAK_CLIENT_ID`      | OIDC client id registered in the Keycloak realm.                                                 |
| `KEYCLOAK_CLIENT_SECRET`  | OIDC client secret (the cdn registers as a confidential client).                                 |
| `KEYCLOAK_SESSION_SECRET` | HMAC key for the local session cookie. **At least 32 random chars.** Rotating logs everyone out. |

## Optional env vars

| Var                       | Default | Purpose                                                                |
|---------------------------|---------|------------------------------------------------------------------------|
| `KEYCLOAK_ADMIN_ROLE`     | `admin` | Keycloak realm role that maps to the cdn `admin` role.                 |
| `PORT`                    | `3000`  | Internal Bun port. Nginx upstreams to `127.0.0.1:$PORT`.               |

## DNS prerequisite

Two records pointing at the host running the container:
- `A   cdn.example.com           → <ip>`
- `A   *.cdn.example.com         → <ip>`

The DNS provider account whose API credentials you ship must be able to
write the `_acme-challenge.cdn.example.com` TXT record (DNS-01 challenge).

## Keycloak configuration

In your Keycloak realm:
1. Create a confidential client with `Client ID = $KEYCLOAK_CLIENT_ID`.
2. **Valid Redirect URIs**: `https://<MAIN_DOMAIN>/auth/callback`.
3. **Valid Post Logout Redirect URIs**: `https://<MAIN_DOMAIN>/auth/post-logout-callback`.
4. Either keep the default `Client authentication: ON` (confidential) and
   copy the client secret to `KEYCLOAK_CLIENT_SECRET`.
5. Add a realm role (default name `admin`) and assign it to the users who
   should reach the admin UI.

## Build the image

`@bernouy/webcomponents` is currently a sibling repo (not yet on npm), so the
build needs it injected via a buildx **named build context**. The buildx
sandbox also needs the host network for DNS resolution of `deb.debian.org`
and the MongoDB apt repo.

```bash
# From the monorepo root:
docker buildx build \
    --network=host \
    --build-context webcomponents=/path/to/WebComponents \
    -f docker/cdn-keycloak/Dockerfile \
    -t bernouy/cdn-keycloak:0.1.0 \
    .
```

When `@bernouy/webcomponents` ships on npm, both flags can be dropped and a
plain `docker build` will work.

## Run

```bash
docker run -d --name cdn \
    -p 80:80 -p 443:443 \
    -v cdn-data:/var/lib/cdn \
    -e MAIN_DOMAIN=cdn.example.com \
    -e LEGO_EMAIL=ops@example.com \
    -e LEGO_DNS_PROVIDER=ovh \
    -e OVH_APPLICATION_KEY=… \
    -e OVH_APPLICATION_SECRET=… \
    -e OVH_CONSUMER_KEY=… \
    -e OVH_ENDPOINT=ovh-eu \
    -e KEYCLOAK_ISSUER=https://auth.example.com/realms/main \
    -e KEYCLOAK_CLIENT_ID=cdn \
    -e KEYCLOAK_CLIENT_SECRET=… \
    -e KEYCLOAK_SESSION_SECRET="$(openssl rand -hex 32)" \
    bernouy/cdn-keycloak:0.1.0

docker logs -f cdn   # watch lego provision the wildcard on first boot
```

## Bringing your own cert (skip lego)

Pre-populate `<volume>/lego/certificates/<MAIN_DOMAIN>.crt` and `.key`
before first boot — the entrypoint sees them and skips lego. You're then
on the hook for renewal.

## Volume layout

```
/var/lib/cdn/
├── mongo/         MongoDB data + journal
├── buckets/       LocalBlobStorage root (one subdir per bucket)
└── lego/
    ├── certificates/   <domain>.{crt,key,issuer.crt,json}
    └── accounts/       lego account state
```

Backup = volume snapshot. Restore = put the volume back. Mongo and blobs
live together so you can't accidentally restore one without the other.

## Updating the image

```bash
docker pull bernouy/cdn-keycloak:<new>
docker stop cdn && docker rm cdn
docker run -d … bernouy/cdn-keycloak:<new>
```

The volume persists. Mongo's storage format is forward-compatible across
patch + minor releases of the same major; major upgrades require the
standard mongo upgrade procedure inside the container (`mongod --upgrade`).

## Caveats

- **Single container = single failure domain.** mongod, nginx and bun
  share the same OOM, restart, and update cycle. Adequate for small/
  medium self-hosted deployments; for higher SLAs split mongo out.
- Mongo binds to **127.0.0.1 only**, no auth — never reachable off the
  container. If you need to inspect the DB, `docker exec -it cdn mongosh`.
- The image is debian-based (~600 MB compressed) because mongo dropped
  alpine support after 4.x. The companion `bernouy/cdn-base` (alpine,
  no DB, BYO bootstrap) stays lean if image size matters.
- `nginx -s reload` is invoked by the cdn lib via the `cdn ALL=(root)
  NOPASSWD: /usr/sbin/nginx -s reload` sudoers rule baked into the image.
