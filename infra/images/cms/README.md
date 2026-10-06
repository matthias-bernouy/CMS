# CMS image and single-server deployment

This directory contains the production image for `@bernouy/cms-server` and
the Compose files used to run several CMS instances on one server. Each CMS
container serves Control on port 3000 and Delivery on port 3001 from one Bun
process.

## Architecture

Run `infra/compose.yml` once per server. It provides:

- `nginx-proxy`, which routes public traffic to CMS containers;
- `acme-companion`, which obtains and renews TLS certificates;
- one authenticated MongoDB server with one persistent `mongo_data` volume.

Run the root `compose.yml` once per CMS instance. Each instance has:

- one CMS container;
- one private official-repository container seeded by the same immutable image;
- one persistent official-repository volume;
- one local `./files` directory for original files and generated variants;
- one MongoDB database named by convention `cms_<instance>`.

Each local CMS instance connects with a distinct user created inside its own
database and granted only `readWrite` on that database. The root account stays
in the infrastructure environment and is never passed to CMS containers. A
compromised CMS credential therefore cannot authenticate to another site's
database, although every site still shares the MongoDB process and its
availability boundary.

Two stable Docker networks connect the stacks:

- `cms_proxy` connects nginx and CMS containers for ingress. A CMS container
  also uses it for required outbound HTTP or SMTP traffic.
- `cms_mongo` is an internal Docker network shared only by MongoDB and CMS
  containers. MongoDB publishes no host port.
- the per-instance `cms_internal` network connects the CMS only to its private
  official repository.

The public routes are:

| URL | Service |
| --- | --- |
| `https://example.com/` | Delivery |
| `https://admin.example.com/login` | Control sign-in |
| `https://admin.example.com/admin/pages` | Control after sign-in |

## Prerequisites

- A Linux server with Docker Engine and Docker Compose v2.33.1 or newer. The
  per-instance stack uses `gw_priority` to keep `cms_proxy` as its outbound
  gateway while `cms_mongo` remains internal.
- Ports 80 and 443 reachable from the internet.
- `openssl`, `rsync`, `gzip`, and `sha256sum` on the deployment machines.
- Enough disk space for the MongoDB volume, per-instance `files` directories,
  image tarballs, staging, and backups.
- A clean CmsCore checkout and its complete workspace when building the image.

Before starting an instance, create DNS records for both its public domain and
its `admin.` subdomain. Every A and AAAA record must resolve to this server.
Let's Encrypt HTTP-01 validation cannot complete while DNS is missing or while
port 80 is unreachable.

## Build a versioned image

Build from the repository root. Use a new tag for every release; never replace
the contents of a tag already deployed. The base images are digest-pinned and
the Bun install uses the frozen lockfile. `IMAGE_VERSION` and `VCS_REF` are
recorded as OCI image labels.

```bash
cd /path/to/CmsCore
set -euo pipefail

test -z "$(git status --porcelain)" || {
    echo "Refusing to build a release from a dirty checkout" >&2
    exit 1
}

VERSION=2026.07.15-1
VCS_REF="$(git rev-parse HEAD)"
IMAGE="bernouy/cms:${VERSION}"

docker build --pull \
    --build-arg "IMAGE_VERSION=${VERSION}" \
    --build-arg "VCS_REF=${VCS_REF}" \
    --tag "${IMAGE}" \
    --file infra/images/cms/Dockerfile \
    .

docker image inspect "${IMAGE}" \
    --format '{{ index .Config.Labels "org.opencontainers.image.version" }} {{ index .Config.Labels "org.opencontainers.image.revision" }}'

docker save "${IMAGE}" | gzip > "/tmp/cms-${VERSION}.tar.gz"
sha256sum "/tmp/cms-${VERSION}.tar.gz" > "/tmp/cms-${VERSION}.tar.gz.sha256"
```

The runtime image runs as the non-root `bun` user and uses a read-only root
filesystem in Compose. It contains the CMS production dependency closure and a
pre-admitted official repository snapshot. The CMS and repository services run
different entry points from that same immutable image.

## Transfer the release

Transfer the allow-listed deployment payload, not a broad copy of the working
directory. A recursive copy could include ignored local `.env` files or
instance `files` data and overwrite server secrets. The proxy upload
configuration, MongoDB scripts, and both environment examples are required.

```bash
VERSION=2026.07.15-1

ssh -t user@SERVER \
    'sudo install -d -o "$(id -u)" -g "$(id -g)" /opt/cms-deploy /opt/cms-deploy/infra'

rsync -a \
    infra/images/cms/Dockerfile \
    infra/images/cms/README.md \
    infra/images/cms/compose.yml \
    infra/images/cms/.env.example \
    user@SERVER:/opt/cms-deploy/

rsync -a \
    infra/images/cms/infra/compose.yml \
    infra/images/cms/infra/.env.example \
    infra/images/cms/infra/nginx-conf.d \
    infra/images/cms/infra/mongo \
    user@SERVER:/opt/cms-deploy/infra/

scp "/tmp/cms-${VERSION}.tar.gz" \
    "/tmp/cms-${VERSION}.tar.gz.sha256" \
    user@SERVER:/tmp/
```

Verify the deployment payload on the server before proceeding:

```bash
VERSION=2026.07.15-1

test -f /opt/cms-deploy/compose.yml
test -f /opt/cms-deploy/.env.example
test -f /opt/cms-deploy/infra/compose.yml
test -f /opt/cms-deploy/infra/.env.example
test -f /opt/cms-deploy/infra/nginx-conf.d/client_max_body.conf
test -f /opt/cms-deploy/infra/mongo/01-validate-root-user.js
test -f /opt/cms-deploy/infra/mongo/provision-site-user.js
test -f /opt/cms-deploy/infra/mongo/validate-env.sh

cd /tmp
sha256sum --check "cms-${VERSION}.tar.gz.sha256"
docker load < "cms-${VERSION}.tar.gz"
```

`client_max_body.conf` sets a server-wide 101 MiB request-body limit: 100 MiB
for the file plus bounded multipart framing. Omitting it makes the nginx
container fail to start because the file is a required bind mount.

## Start fresh shared infrastructure

This procedure is for a new, empty MongoDB volume. For an existing legacy
unauthenticated volume, use the migration procedure below instead: the official
MongoDB initializer does not run against a non-empty volume.

```bash
cd /opt/cms-deploy/infra

umask 077
MONGO_ROOT_PASSWORD="$(openssl rand -hex 32)"

{
    printf 'LETSENCRYPT_EMAIL=%s\n' 'ops@example.com'
    printf 'MONGO_ROOT_USERNAME=%s\n' 'cms_root'
    printf 'MONGO_ROOT_PASSWORD=%s\n' "${MONGO_ROOT_PASSWORD}"
} > .env

chmod 600 .env
unset MONGO_ROOT_PASSWORD

docker compose config --quiet
docker compose pull
docker compose up -d --wait
docker compose ps
```

Store `/opt/cms-deploy/infra/.env` in an encrypted backup or secret manager.
The password is a 64-character hexadecimal value. Restrict the infrastructure
directory and `.env` to trusted operators.

On the first start of a fresh volume, the official MongoDB entrypoint creates
the root account. `mongo/validate-env.sh` validates its username and secret
before initialization, and `mongo/01-validate-root-user.js` verifies the exact
`root@admin` role. Site users are provisioned separately and never live in
`admin`.

The infrastructure health checks should be healthy before any CMS instance is
started. Starting it also creates the stable `cms_proxy` and `cms_mongo`
networks required by each instance Compose project.

## Start a CMS instance

Use a lowercase, stable instance slug and keep its database name exactly
`cms_<instance>`. Never reuse one database for two sites.

The following example creates `/opt/cms-sites/client`. It reads the shared
MongoDB password without echoing it and writes all generated secrets directly
to a mode-0600 `.env`; it does not put passwords in the shell command history.

```bash
sudo install -d -m 0750 /opt/cms-sites/client
sudo chown "$(id -u):$(id -g)" /opt/cms-sites/client
cd /opt/cms-sites/client

cp /opt/cms-deploy/compose.yml ./compose.yml
cp /opt/cms-deploy/.env.example ./.env.example

DOMAIN=client.example.com
INSTANCE=client
DATABASE="cms_${INSTANCE}"
CMS_IMAGE=bernouy/cms:2026.07.15-1
MONGO_SITE_USERNAME=cms_client
MONGO_SITE_PASSWORD="$(openssl rand -hex 32)"

# Provision or validate the bounded account while authenticating as root. The
# password is passed through the exec environment, not interpolated into JS.
(
    set -a
    . /opt/cms-deploy/infra/.env
    set +a
    export MONGO_SITE_DATABASE="${DATABASE}" MONGO_SITE_USERNAME MONGO_SITE_PASSWORD
    cd /opt/cms-deploy/infra
    docker compose exec -T \
        -e MONGO_SITE_DATABASE -e MONGO_SITE_USERNAME -e MONGO_SITE_PASSWORD \
        mongo mongosh --quiet \
        --username "${MONGO_ROOT_USERNAME}" \
        --password "${MONGO_ROOT_PASSWORD}" \
        --authenticationDatabase admin \
        /opt/cms-mongo/provision-site-user.js
)

umask 077
CMS_ADMIN_PASSWORD="$(openssl rand -hex 24)"
CMS_CORE_PROVIDER_TOKEN="$(openssl rand -hex 32)"
ULVIA_REPOSITORY_TOKEN="$(openssl rand -hex 32)"
{
    printf 'DOMAIN=%s\n' "${DOMAIN}"
    printf 'CMS_IMAGE=%s\n' "${CMS_IMAGE}"
    printf 'MONGO_URL=mongodb://%s:%s@mongo:27017/%s?authSource=%s\n' \
        "${MONGO_SITE_USERNAME}" "${MONGO_SITE_PASSWORD}" "${DATABASE}" "${DATABASE}"
    printf 'CMS_SESSION_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'CMS_KEK_HEX=%s\n' "$(openssl rand -hex 32)"
    printf 'CMS_ADMIN_EMAIL=%s\n' "admin@${DOMAIN}"
    printf 'CMS_ADMIN_PASSWORD=%s\n' "${CMS_ADMIN_PASSWORD}"
    printf 'CMS_CORE_PROVIDER_TOKEN=%s\n' "${CMS_CORE_PROVIDER_TOKEN}"
    printf 'ULVIA_REPOSITORY_TOKEN=%s\n' "${ULVIA_REPOSITORY_TOKEN}"
} > .env

chmod 600 .env
unset MONGO_SITE_PASSWORD CMS_ADMIN_PASSWORD CMS_CORE_PROVIDER_TOKEN ULVIA_REPOSITORY_TOKEN

sudo install -d -o 1000 -g 1000 -m 0750 files

docker compose config --quiet
docker compose up -d --wait
docker compose ps
```

The image runs with UID/GID 1000. The bind-mounted `files` directory must be
writable by that identity. Keep the generated initial admin password
in a password manager before removing it from any operator workflow; it remains
in the protected `.env` because Compose requires the variable on every start,
but the runtime uses it only when bootstrapping a missing local credential.

Check both public URLs and an authenticated file upload after deployment. TLS
issuance may take a short time after a domain is first attached.

### External MongoDB

`MONGO_URL` is explicit, so an instance can use a managed or separately
operated MongoDB cluster instead of the server-wide MongoDB service. Change
only that instance's URL:

```dotenv
MONGO_URL='mongodb+srv://cms_client:URL_ENCODED_PASSWORD@cluster.example.net/cms_client?retryWrites=true&w=majority'
```

Create a dedicated database user with read/write access only to that database
when the provider supports it. Percent-encode reserved characters in URI
credentials. Single-quote the `.env` value when it contains `$`, `#`, or other
characters that Docker Compose could otherwise interpret. Allow the server's
outbound address in the provider firewall and require TLS.

The shared infrastructure stack is still required for nginx, certificates,
and the two external Docker networks. The local MongoDB service may remain
unused by this particular instance.

## Environment variables

The example files are the starting points:

- `infra/.env.example` configures server-wide infrastructure.
- `.env.example` configures one CMS instance.

Docker Compose `.env` files do not execute commands. Generate secrets first as
shown above; do not paste a literal `$(openssl rand ...)` expression into an
environment file.

### Required per instance

| Variable | Purpose |
| --- | --- |
| `DOMAIN` | Delivery domain; Control is derived as `admin.${DOMAIN}`. |
| `CMS_IMAGE` | Unique, immutable image tag or registry digest. |
| `MONGO_URL` | Authenticated URL whose path selects this instance's database. |
| `CMS_SESSION_SECRET` | Session-cookie signing secret; use at least 32 random bytes. |
| `CMS_KEK_HEX` | Exactly 32 random bytes encoded as 64 hexadecimal characters. |
| `CMS_ADMIN_PASSWORD` | Initial local admin password; only used if the credential does not yet exist. |
| `CMS_CORE_PROVIDER_TOKEN` | Private credential used to connect the bundled CMS Core provider. |
| `ULVIA_REPOSITORY_TOKEN` | Mutation-signing secret for this instance's private official repository. |

### Optional CMS and authentication settings

| Variable | Default or purpose |
| --- | --- |
| `CMS_ADMIN_EMAIL` | Defaults to `admin@${DOMAIN}`. |
| `CMS_GATEWAY_SITE_ID` | Stable opaque site ID; defaults to `default`. It scopes the bundled Core provider, collection installation and gateway selections. |
| `CMS_AUTH_SITE_NAME` | Public authentication site name; defaults to `CMS`. |
| `CMS_AUTH_EMAIL_COOLDOWN_SECONDS` | Email throttle interval; defaults to 300 seconds. |
| `CMS_COLLECTION_MIGRATION_ROLLBACK_RETENTION` | Full rollback journals retained per site; defaults to 100. Purged journals keep a lightweight audit summary. |
| `CMS_AUTH_EMAIL_VERIFICATION_URL` | Delivery email-verification URL. |
| `CMS_AUTH_PASSWORD_RESET_URL` | Delivery password-reset URL. |
| `CMS_CONTROL_AUTH_EMAIL_VERIFICATION_URL` | Control email-verification URL. |
| `CMS_CONTROL_AUTH_PASSWORD_RESET_URL` | Control password-reset URL. |

Treat the MongoDB URL, session secret, KEK, Core provider token, repository
token and any configured SMTP credentials as server-side secrets. Never expose
them to browser code or commit them to the repository.

## Backups

Back up MongoDB, every instance's `files` directory and `repository_data`
volume, and the protected `.env` files. The seed can reconstruct the initial
official catalogue, but it cannot reconstruct later publications, yanks or
receipts.

Test restoration regularly. To obtain a cross-store consistent backup, pause
the affected CMS containers while dumping their databases and archiving their
files; this causes a planned interruption.

For an all-sites backup, stop every local instance before starting the dump.
The following loop deliberately ignores template directories without a `.env`:

```bash
for SITE_DIRECTORY in /opt/cms-sites/*; do
    if [ -f "${SITE_DIRECTORY}/compose.yml" ] && [ -f "${SITE_DIRECTORY}/.env" ]; then
        docker compose --project-directory "${SITE_DIRECTORY}" stop cms
    fi
done
```

From `/opt/cms-deploy/infra`, this command dumps all databases visible to the
root user. Omitting `--db` means all dumpable databases. `--db=admin` would dump
only the `admin` database and is not an all-databases backup.

```bash
cd /opt/cms-deploy/infra
umask 077
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

docker compose exec -T mongo sh -ec '
    exec mongodump \
        --host 127.0.0.1 \
        --username "$MONGO_INITDB_ROOT_USERNAME" \
        --password "$MONGO_INITDB_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --archive --gzip
' > "mongo-all-${STAMP}.archive.gz"

gzip -t "mongo-all-${STAMP}.archive.gz"
```

For a smaller per-instance dump, pass its exact database name:

```bash
cd /opt/cms-deploy/infra
DATABASE=cms_client
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

docker compose exec -T -e "BACKUP_DATABASE=${DATABASE}" mongo sh -ec '
    exec mongodump \
        --host 127.0.0.1 \
        --username "$MONGO_INITDB_ROOT_USERNAME" \
        --password "$MONGO_INITDB_ROOT_PASSWORD" \
        --authenticationDatabase admin \
        --db "$BACKUP_DATABASE" \
        --archive --gzip
' > "${DATABASE}-${STAMP}.archive.gz"
```

Archive local files while that instance is stopped or from a consistent
filesystem snapshot:

```bash
cd /opt/cms-sites/client
umask 077
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose stop cms
tar --numeric-owner -czf "client-media-${STAMP}.tar.gz" files .env compose.yml
docker compose up -d --wait
```

Repeat that archive block for every instance stopped before the all-databases
dump; each successful block restarts that instance.

Use the database provider's snapshot and point-in-time recovery procedures for
external MongoDB. Copy backups away from the application server.

## Update and rollback

### CMS image

Build and transfer every release under a new tag. After loading or pulling the
image, edit only `CMS_IMAGE` in the instance `.env`, validate, and recreate the
service:

```bash
cd /opt/cms-sites/client
docker compose config --quiet
docker compose up -d --wait
```

Compose normally stops the existing container before the replacement is ready,
so a brief interruption is expected. This topology does not provide zero-
downtime updates.

To roll back, restore the previous `CMS_IMAGE` value and run the same command.
Keep the previous image locally and confirm that the older release is compatible
with any data written by the newer release. Take a backup before releases that
change persistent data.

File content published by current releases is addressed through an immutable
`blobKey` stored in MongoDB. Releases from before that field existed read only
the legacy file ID and therefore cannot safely consume files replaced by a
newer release. Do not roll back to such a release in place: restore the matching
MongoDB and files backup together, or deploy a forward-compatible fix instead.

### Shared infrastructure

Back up MongoDB first, transfer the allow-listed new `infra` payload, then run
`docker compose pull` and `docker compose up -d --wait` from the existing
infrastructure Compose project. MongoDB or proxy recreation can interrupt every
site on the server. Do not change the Compose project name or volume mapping
accidentally.

## Secret rotation

The MongoDB entrypoint and `01-validate-root-user.js` run automatically only
when `mongo_data` is empty. Editing an `.env` file on an existing volume does
not change a MongoDB user's password.

Rotate the root and site accounts separately:

- For root, authenticate with the current root credential and update that
  user's password in `admin` first. Immediately put the same new value in
  `MONGO_ROOT_PASSWORD` inside `infra/.env`, then run
  `docker compose up -d --wait --force-recreate mongo`. Until recreation, the
  health check still carries the old password. The MongoDB restart briefly
  interrupts every local CMS, but no instance `MONGO_URL` changes.
- For a site credential, create a second user in that site's database with
  `readWrite` on that database only, update only that instance's `MONGO_URL`,
  recreate and verify the CMS container, then remove the old site user. Other
  instances are unaffected. Keep the old URL until the canary succeeds so the
  rotation remains reversible.

Never pass the root credential to a CMS container. Editing an `.env` file alone
does not update a database user or an already-running container.

Other instance secrets have different semantics:

- Rotating `CMS_SESSION_SECRET` signs future cookies with a new key and logs
  existing sessions out.
- Do not replace `CMS_KEK_HEX` directly. Existing DEKs must be re-wrapped first,
  or encrypted secrets and protected fields become unreadable.
- Changing `CMS_ADMIN_PASSWORD` does not reset an existing admin credential; it
  is bootstrap-only.

## Migrate a legacy unauthenticated shared MongoDB volume

This section applies to the previous single-server layout: one shared MongoDB
container named `mongo`, no database authentication, and one database named
`cms_<INSTANCE_ID>` per site. It keeps the same MongoDB data volume. The root
and every database-scoped site user **must be created while the old
unauthenticated MongoDB process is still running**, before the new Compose
configuration starts MongoDB with authentication enabled.

Plan a maintenance window. Keep the old Compose files, every instance `.env`,
the image versions, and the original MongoDB volume until the migration and its
backups have been verified. Never run `docker compose down -v` during this
procedure.

### 1. Inventory exact database and volume names

List all legacy CMS databases and record the mapping to instance directories.
Do not rename a database during this migration.

```bash
docker exec mongo mongosh --quiet --eval '
    db.adminCommand({ listDatabases: 1 }).databases
        .map(database => database.name)
        .filter(name => name.startsWith("cms_"))
        .sort()
        .forEach(print)
'

docker inspect mongo \
    --format 'project={{ index .Config.Labels "com.docker.compose.project" }}{{ println }}{{ range .Mounts }}{{ if eq .Destination "/data/db" }}volume={{ .Name }}{{ end }}{{ end }}'
```

Record the reported Compose project and volume. Apply the new infrastructure
Compose file from the same project/directory, or pass the same `--project-name`,
so its `mongo_data` declaration resolves to that exact existing volume. If the
resolved volume differs, stop and correct the Compose project or volume mapping
before starting the new MongoDB container.

### 2. Pause writes and take recovery backups

Stop `cms` in every legacy instance directory, but leave the old `mongo`
container running without authentication.

```bash
cd /opt/cms-sites/client
docker compose stop cms
```

Repeat for every instance. Then take an all-databases dump by deliberately
omitting `--db`, and archive each instance's files and protected `.env`:

```bash
umask 077
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
docker exec -i mongo mongodump --archive --gzip \
    > "legacy-mongo-all-${STAMP}.archive.gz"
gzip -t "legacy-mongo-all-${STAMP}.archive.gz"

tar --numeric-owner -czf "client-recovery-${STAMP}.tar.gz" \
    -C /opt/cms-sites/client files .env compose.yml
```

Copy these backups off the server before continuing. Keep all CMS instances
stopped until authentication is active and their URLs have been updated.

### 3. Prepare credentials without enabling authentication

Prepare the new infrastructure `.env` with fresh hexadecimal passwords and
mode 0600 as shown in the fresh-install section. Do not start the new Compose
stack yet.

Copy the root-validation and site-provisioning scripts temporarily into the
still-running legacy `mongo` container. Create the root user first, then run the
site provisioning script once per database with a unique username and password.
Record each generated site credential directly in that instance's protected
`.env`.

```bash
docker cp /opt/cms-deploy/infra/.env mongo:/tmp/cms-auth-migration.env
docker cp /opt/cms-deploy/infra/mongo/01-validate-root-user.js \
    mongo:/tmp/01-validate-root-user.js
docker cp /opt/cms-deploy/infra/mongo/provision-site-user.js \
    mongo:/tmp/provision-site-user.js

docker exec mongo sh -ec '
    trap "rm -f /tmp/cms-auth-migration.env /tmp/01-validate-root-user.js" EXIT
    set -a
    . /tmp/cms-auth-migration.env
    set +a
    export MONGO_INITDB_ROOT_USERNAME="$MONGO_ROOT_USERNAME"
    export MONGO_INITDB_ROOT_PASSWORD="$MONGO_ROOT_PASSWORD"
    mongosh --quiet --eval "
        const admin = db.getSiblingDB(\"admin\");
        admin.createUser({
            user: \"$MONGO_ROOT_USERNAME\",
            pwd: \"$MONGO_ROOT_PASSWORD\",
            roles: [{ role: \"root\", db: \"admin\" }]
        });
    "
    mongosh --quiet /tmp/01-validate-root-user.js
'
```

For each recorded `cms_<instance>` database, run `provision-site-user.js` while
the legacy server is still unauthenticated:

```bash
MONGO_SITE_DATABASE=cms_client
MONGO_SITE_USERNAME=cms_client
MONGO_SITE_PASSWORD="$(openssl rand -hex 32)"
docker exec \
    -e MONGO_SITE_DATABASE -e MONGO_SITE_USERNAME -e MONGO_SITE_PASSWORD \
    mongo mongosh --quiet /tmp/provision-site-user.js
```

Store that password in the matching instance `.env`, then unset it. Repeat with
a distinct username and password for every site. Remove the temporary scripts
from the container after every account has been verified.

### 4. Activate the new authenticated infrastructure on the same volume

Back up the legacy infrastructure Compose file. Install the new
`infra/compose.yml`, `infra/.env.example`, `infra/mongo` directory, and
`infra/nginx-conf.d` directory into that same Compose project directory. Keep
the prepared `.env` in place with mode 0600.

Stop the old MongoDB process without deleting its volume, then start the new
stack using the recorded Compose project name:

```bash
cd /path/to/existing-infra-project
docker compose --project-name RECORDED_PROJECT stop mongo

docker compose --project-name RECORDED_PROJECT config --quiet
docker compose --project-name RECORDED_PROJECT up -d --wait
docker compose --project-name RECORDED_PROJECT ps
```

The initialization script will not run automatically because the volume is
non-empty; that is why the root and site users were created in step 3. Confirm that MongoDB
is healthy with authentication enabled and that the mounted `/data/db` volume
name is still the one recorded in step 1.

### 5. Update each CMS without changing its database path

For every instance:

1. Back up its legacy Compose file and `.env` without exposing the secrets.
2. Install the new per-instance `compose.yml` and `.env.example`.
3. Preserve the existing `CMS_SESSION_SECRET`, `CMS_KEK_HEX`, admin settings,
   and `files` directory.
4. Add `CMS_IMAGE` and an authenticated `MONGO_URL` whose database path is
   exactly the old `cms_<INSTANCE_ID>` value.
5. Ensure `files` is owned by UID/GID 1000.

For an old `INSTANCE_ID=client`, the URL becomes:

```dotenv
MONGO_URL=mongodb://cms_client:SITE_HEX_PASSWORD@mongo:27017/cms_client?authSource=cms_client
```

Do not change `cms_client` to a new name: the migration reuses the existing
database in place and does not require `mongorestore` during the normal path.

Validate and start one canary instance first:

```bash
cd /opt/cms-sites/client
sudo chown -R 1000:1000 files
docker compose config --quiet
docker compose up -d --wait
```

Verify its public pages, Control login, content, users, encrypted settings, and
file upload/download. Then update and start the remaining instances. Keep the
maintenance window open until every database path and site has been checked.

If rollback is required, stop the new CMS containers, restore the saved legacy
Compose files and URLs, and restart the legacy MongoDB configuration against the
preserved volume. Existing users do not prevent MongoDB from running without
authentication. Do not delete the volume or the recovery dumps while the
rollback window remains open.

## Security and operational limits

- MongoDB is authenticated, not published on a host port, and connected through
  an internal network. Every CMS credential is additionally restricted to one
  database; the root credential remains infrastructure-only.
- CMS containers run as UID/GID 1000 with a read-only root filesystem, all
  Linux capabilities dropped, `no-new-privileges`, and a bounded `/tmp` tmpfs.
- `nginx-proxy` and `acme-companion` can access the Docker socket. Treat the
  infrastructure stack and host as a privileged trust boundary.
- The proxy accepts request bodies up to 101 MiB for every virtual host. The
  application still caps an uploaded file at 100 MiB and bounds other body
  types independently.
- There is one MongoDB process and one MongoDB volume per server, without a
  replica set or automatic failover. It is a single failure and maintenance
  domain for all local CMS instances.
- Each instance is one CMS process with an in-memory cache and local file
  storage. It is not highly available, and files are not replicated.
- Health checks and `restart: unless-stopped` improve recovery from simple
  process failures; they do not provide high availability or zero downtime.
