# Basic CMS image

Production-ready CMS image — admin Control + public Delivery — served by
a single Bun process. Designed to host **many instances on the same
server**, sharing one nginx + one MongoDB.

- **Shared infrastructure** (`infra/compose.yml`): `nginx-proxy` (dynamic
  reverse proxy, watches Docker for new instances), `acme-companion`
  (auto-TLS via Let's Encrypt), `mongo` (single shared cluster, one
  database per instance).
- **Per-instance** (`compose.yml`): just the `cms` container, declares
  its domain via `VIRTUAL_HOST_MULTIPORTS` + `LETSENCRYPT_HOST` env vars;
  joins the infra `cms_net` network.

Each instance gets its own MongoDB database (`cms_<INSTANCE_ID>`) and its
own `./files` blob folder. File storage is local to each instance; the
rest is in MongoDB.

## Build (on dev machine)

```bash
cd /path/to/CmsCore
docker build -t bernouy/cms:basic -f images/cms/Dockerfile .

# Save as a tarball for the server
docker save bernouy/cms:basic | gzip > /tmp/cms-image.tar.gz
```

## Transfer to server

```bash
scp /tmp/cms-image.tar.gz                 user@SERVER:/tmp/
scp images/cms/infra/compose.yml          user@SERVER:/opt/cms-infra/compose.yml
scp images/cms/compose.yml                user@SERVER:/opt/cms-sites/_template/compose.yml
```

## Server: bring up the infra (once per server)

```bash
ssh user@SERVER

docker load < /tmp/cms-image.tar.gz
# → Loaded image: bernouy/cms:basic

cd /opt/cms-infra
cat > .env <<'EOF'
LETSENCRYPT_EMAIL=ops@yourdomain.com
EOF

docker compose up -d
# Pulls nginx-proxy / acme-companion / mongo, starts everything, creates
# the `cms_net` docker network.
```

## Server: bring up an instance

```bash
# One folder per instance. Copy the template.
mkdir -p /opt/cms-sites/clientX/files
cp /opt/cms-sites/_template/compose.yml /opt/cms-sites/clientX/

cd /opt/cms-sites/clientX
cat > .env <<EOF
DOMAIN=clientX.com
INSTANCE_ID=clientX
CMS_SESSION_SECRET=$(openssl rand -hex 32)
CMS_KEK_HEX=$(openssl rand -hex 32)
CMS_ADMIN_PASSWORD=$(openssl rand -base64 18)
EOF

docker compose up -d
```

**DNS prerequisite:** both `clientX.com` and `admin.clientX.com` must
already resolve to the server before bring-up, otherwise acme-companion
cannot complete the http-01 challenge. It retries automatically once DNS
is up, no manual intervention needed.

Browser:

| URL | Purpose |
|---|---|
| `https://clientX.com/`            | public site (Delivery) |
| `https://admin.clientX.com/login` | admin sign-in |
| `https://admin.clientX.com/admin/pages` | admin home (after sign-in) |

## Required env per instance

| Env | Description |
|---|---|
| `DOMAIN`              | public domain (apex). `admin.${DOMAIN}` is derived. |
| `INSTANCE_ID`         | mongo db name suffix. Required unless `MONGO_URL` is overridden. |
| `CMS_SESSION_SECRET`  | HMAC key signing the session cookie. `openssl rand -hex 32`. |
| `CMS_KEK_HEX`         | 32-byte hex master key wrapping the per-scope DEK. `openssl rand -hex 32`. **Rotating this requires re-wrapping every DEK** — don't change it casually. |
| `CMS_ADMIN_PASSWORD`  | bootstrap admin password. One-shot: only used the first time the credential is created (no further reset from env). |
| `CMS_ADMIN_EMAIL`     | optional, defaults to `admin@${DOMAIN}`. |
| `MONGO_URL`           | optional, defaults to `mongodb://mongo:27017/cms_${INSTANCE_ID}`. Override for external clusters (MongoDB Atlas, …). |

## Updating an instance to a new image version

```bash
# Build + transfer new image (same as initial build above)
docker save bernouy/cms:basic | gzip > /tmp/cms-image.tar.gz
scp /tmp/cms-image.tar.gz user@SERVER:/tmp/

# On server: load new image, then restart instances. nginx-proxy keeps
# routing the old containers until the new ones come up.
ssh user@SERVER 'docker load < /tmp/cms-image.tar.gz'

# Per instance:
ssh user@SERVER 'cd /opt/cms-sites/clientX && docker compose up -d'
```

## Backup

```bash
# Mongo (one cmd per instance database, or `--db=admin` for all)
docker exec -i mongo mongodump --db=cms_clientX --archive --gzip > clientX-mongo.gz

# Files (per-instance folder)
tar czf clientX-files.tgz -C /opt/cms-sites/clientX files
```

## What this image is

- **Persistent.** Content, users, secrets — all in MongoDB.
- **HTTPS by default.** No HTTP fallback; acme-companion obtains certs
  before any traffic reaches the cms container.
- **Multi-instance per server.** One nginx + one Mongo, N instances.
- **Single Bun process per instance.** Control + Delivery on two
  internal ports (3000/3001), routed by nginx-proxy.

## What this image is NOT

- **Not HA per instance.** Each instance is a single container; cache
  is in-memory. For HA, see the multi-instance Delivery pattern in
  `docs/architecture` (TBD).
- **Not auth-protected at the database level.** Mongo runs without auth
  on the docker network. If you publish the mongo port or share the
  network with untrusted containers, add auth.
