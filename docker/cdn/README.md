# `bernouy/cdn-base` — Docker base image for `@bernouy/cdn`

Single-container base image bundling Bun + nginx + lego + the workspace
libraries. Users `FROM bernouy/cdn-base` and add their own bootstrap.

## Layout

```
docker/cdn/
├── Dockerfile             ← the base image
├── runtime.package.json   ← pre-installed deps in the image's /app/
├── nginx.conf.template    ← envsubst'd at startup with ${MAIN_DOMAIN}
├── entrypoint.sh          ← cert bootstrap + nginx + user CMD supervisor
├── README.md              ← this file
└── example/               ← what users copy as a starting point
    ├── Dockerfile         ← FROM bernouy/cdn-base, COPY server.ts
    ├── server.ts          ← bootstrap example (devAuth — replace!)
    └── docker-compose.yml ← cdn + mongo + persistent volumes
```

## Build the base image

```bash
# From the monorepo root:
docker build -f docker/cdn/Dockerfile -t bernouy/cdn-base:0.1.0 .
```

Tag matches `packages/cdn/package.json` `version`. Bump both together when
shipping new functionality.

## What's pre-installed at /app/

The `/app/` dir already has these resolved in `node_modules/`:
- `@bernouy/core`, `@bernouy/runner-bun`, `@bernouy/cdn`
- `@bernouy/auth-keycloak`, `@bernouy/auth-token`, `@bernouy/auth-composite`
- `mongodb`

If you need anything else, `RUN bun add …` in your derived Dockerfile.

## Required runtime env

| Var                  | Required             | Purpose                                                      |
|----------------------|----------------------|--------------------------------------------------------------|
| `MONGODB_URI`        | yes                  | Mongo connection string.                                     |
| `MAIN_DOMAIN`        | yes                  | e.g. `cdn.example.com`. The wildcard cert covers `*.<MAIN_DOMAIN>` for bucket sub-domains. |
| `LEGO_EMAIL`         | yes                  | ACME account email (registered on first boot).               |
| `LEGO_DNS_PROVIDER`  | first boot + aliases | lego DNS provider id (`ovh`, `route53`, `cloudflare`, …). Required for the wildcard cert; forwarded to per-alias issuance. |
| `<DNS>_*`            | with DNS-01          | Provider-specific credentials. The example bootstrap forwards anything matching the well-known prefixes. |
| `PORT`               | no (default 3000)    | Internal Bun port. Nginx upstreams to `127.0.0.1:$PORT`.     |

## DNS prerequisite

Two records, both pointing at the host running the container:

- `A   cdn.example.com           → <ip>`
- `A   *.cdn.example.com         → <ip>`

For DNS-01 cert provisioning (the only path that issues wildcards), the
account whose API credentials you ship to the container must be able to
write the `_acme-challenge.cdn.example.com` TXT record.

## First-boot lifecycle (entrypoint)

1. Renders `nginx.conf` from the template using `${MAIN_DOMAIN}`.
2. If `/etc/lego/certificates/${MAIN_DOMAIN}.crt` is **absent**, runs lego
   with `--dns ${LEGO_DNS_PROVIDER}` for `MAIN_DOMAIN` AND `*.MAIN_DOMAIN`.
   Blocks until the cert is ready.
3. `nginx -t` validates the rendered config + cert paths.
4. nginx + the user's CMD start in parallel; either dying takes the
   container down (good for orchestrators).

## Quick start

```bash
# 1. Build the base
docker build -f docker/cdn/Dockerfile -t bernouy/cdn-base:0.1.0 .

# 2. Bootstrap a deployment
cp -r docker/cdn/example ~/my-cdn && cd ~/my-cdn
# edit docker-compose.yml + server.ts to taste
cat > .env <<EOF
OVH_APPLICATION_KEY=...
OVH_APPLICATION_SECRET=...
OVH_CONSUMER_KEY=...
EOF
docker compose up -d
docker compose logs -f cdn   # watch lego provision the wildcard
```

## Bringing your own cert (skip lego)

Mount the cert directly — the entrypoint sees it and skips lego:

```yaml
volumes:
    - ./certs/cdn.example.com.crt:/etc/lego/certificates/cdn.example.com.crt:ro
    - ./certs/cdn.example.com.key:/etc/lego/certificates/cdn.example.com.key:ro
```

You're then on the hook for renewal.

## Caveats

- `mongo` ships **without authentication** in the example compose. Enable
  it (and TLS, ideally) before exposing publicly — see
  `packages/cdn/docs/prod/getting-started.md` §4.
- `nginx` user is added to the `cdn` group so it can read through the blob
  root's 0750 permission.
- The base image embeds the workspace at `/socle/`. If you need to
  customise a workspace package (patch the cdn lib), build your own base
  with the patch applied.
- `nginx -s reload` is invoked by the cdn lib via the `cdn ALL=(root)
  NOPASSWD: /usr/sbin/nginx -s reload` sudoers rule baked into the image.
