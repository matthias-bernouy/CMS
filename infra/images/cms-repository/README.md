# Global integration repository image

This image runs `@bernouy/cms-repository-server` without MongoDB or S3. It has
two listeners on one dedicated internal Docker network:

- port 3001 serves anonymous repository reads under `/.cms/repository`;
- port 3000 is the internal operations listener. Its separately authenticated
  management, maintenance, and verifier protocols share the
  `/.cms/repository-management` prefix.

Neither listener is published to the host or attached to public ingress in the
base stack. The designated repository hub CMS joins `cms_repository` to provide
the canonical anonymous Delivery origin and an admin-authenticated Control
gateway. Public reads have no token, including complete package downloads.
Human publication is a CLI operation authenticated with an ordinary CMS PAT;
the internal repository management credential stays mounted server-side in the
CMS gateway and repository runtime.

## Build and prepare

Build both runtime images from the workspace root. The repository accepts an
immutable version tag or digest. The verifier also serves as the fixed sandbox,
so production requires that image by registry digest and records the same digest
as its runner identity:

```bash
docker build --pull \
  --tag bernouy/cms-repository:2026.07.26-1 \
  --file infra/images/cms-repository/Dockerfile \
  .

VERIFIER_TAG=registry.example.com/bernouy/cms-integration-verifier:2026.07.26-1
docker build --pull \
  --tag "${VERIFIER_TAG}" \
  --file infra/images/cms-repository/Verifier.Dockerfile \
  .
docker push "${VERIFIER_TAG}"
docker pull "${VERIFIER_TAG}"

VERIFIER_IMAGE="$(docker image inspect --format '{{ index .RepoDigests 0 }}' "${VERIFIER_TAG}")"
VERIFIER_DIGEST="${VERIFIER_IMAGE##*@}"
case "${VERIFIER_IMAGE}" in
  *@sha256:????????????????????????????????????????????????????????????????) ;;
  *) echo 'Verifier registry digest was not resolved' >&2; exit 1 ;;
esac
```

Prepare the deployment directory and every file-backed credential without
putting secret values in `.env`. The worker token and PostgreSQL password each
have two byte-identical files because their consumers run under different
numeric identities; the isolated preflight rejects any mismatch. Each Ed25519
private key signs short-lived capabilities for one sandbox and only that sandbox
receives its matching public key:

```bash
cd /opt/cms-repository
umask 077
install -d -m 0700 secrets
sudo install -d -o 1000 -g 1000 -m 0750 registry

openssl rand -hex 32 | tr -d '\n' > secrets/repository-management-token
openssl rand -hex 32 | tr -d '\n' > secrets/repository-maintenance-token
openssl rand -hex 32 | tr -d '\n' > secrets/repository-worker-token
cp secrets/repository-worker-token secrets/verifier-worker-token
openssl rand -hex 32 | tr -d '\n' > secrets/repository-worker-capability-key
openssl rand -hex 32 | tr -d '\n' > secrets/verifier-postgres-password
cp secrets/verifier-postgres-password secrets/verifier-postgres-server-password
openssl genpkey -algorithm Ed25519 -out secrets/verifier-sandbox-ed25519-private.pem
openssl pkey \
  -in secrets/verifier-sandbox-ed25519-private.pem \
  -pubout \
  -out secrets/verifier-sandbox-ed25519-public.pem
openssl genpkey -algorithm Ed25519 -out secrets/release-runtime-ed25519-private.pem
openssl pkey \
  -in secrets/release-runtime-ed25519-private.pem \
  -pubout \
  -out secrets/release-runtime-ed25519-public.pem

chmod 0600 secrets/*
sudo chown 1000:1000 \
  secrets/repository-management-token \
  secrets/repository-maintenance-token \
  secrets/repository-worker-token \
  secrets/repository-worker-capability-key
sudo chown 1001:1001 \
  secrets/verifier-worker-token \
  secrets/verifier-sandbox-ed25519-private.pem \
  secrets/release-runtime-ed25519-private.pem \
  secrets/verifier-postgres-password
sudo chown 70:70 secrets/verifier-postgres-server-password
sudo chown 1002:1002 \
  secrets/verifier-sandbox-ed25519-public.pem \
  secrets/release-runtime-ed25519-public.pem
sudo chmod 0444 \
  secrets/verifier-sandbox-ed25519-public.pem \
  secrets/release-runtime-ed25519-public.pem

cp .env.example .env
```

Set all three image identities in `.env`: `CMS_REPOSITORY_IMAGE` to the
repository tag or digest, `CMS_INTEGRATION_VERIFIER_IMAGE` to
`${VERIFIER_IMAGE}`, and `CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST` to
`${VERIFIER_DIGEST}`. Keep the secret-file paths from `.env.example`, then
validate and start the complete repository, verifier, SQL sandbox, full-stack
release runtime, and disposable PostgreSQL stack:

```bash
docker compose config --quiet
docker compose up -d --wait
```

Compose intentionally refuses to create `./registry` on the operator's behalf.
This prevents Docker from silently creating a root-owned bind directory that
the UID/GID 1000 runtime cannot write. Run the preparation commands above before
the first `docker compose up`.

The application root filesystems are read-only. The dedicated `./registry` bind
mount is the only state that must be durable or backed up. The full-stack runner
uses a scratch volume shared only with its private Docker daemon so Supabase bind
mounts resolve inside that daemon; every scenario removes its containers and
task directory. The daemon itself stores container state on bounded tmpfs and
receives no repository or production credential. It is the only privileged
service and does not mount the host Docker socket.

## Public repository hub and management CMS connection

Run the CMS-authored hub with its normal Compose file plus
`repository-hub.override.yml`. The override joins the internal repository
network, enables the anonymous same-origin catalog facade, and points it at
`http://cms-repository:3001/.cms/repository`. It also enables the Control-side
`/.cms/repository-management` gateway and mounts the internal management
credential used only for gateway-to-repository calls. The read URL is repeated
because Compose expands required values in the base file before merging the
override:

```dotenv
P9R_INTEGRATION_REPOSITORY_URL=http://cms-repository:3001/.cms/repository
CMS_REPOSITORY_NETWORK_NAME=cms_repository
CMS_REPOSITORY_MANAGEMENT_UPSTREAM_TOKEN_SECRET_FILE=/opt/cms-repository/secrets/repository-management-token
```

Then render and start the designated hub CMS with both files. No ordinary CMS
uses this override:

```bash
docker compose \
  -f /path/to/cms/compose.yml \
  -f /path/to/cms-repository/repository-hub.override.yml \
  config --quiet
docker compose \
  -f /path/to/cms/compose.yml \
  -f /path/to/cms-repository/repository-hub.override.yml \
  up -d --wait
```

The override exposes the catalog API but does not create public pages or a
repository-management tab in the CMS database. First publish the checked-in
official releases through the normal candidate workflow described below. The
retained `packages/resources/sites/cms-repository-hub` directory is a migration
reference, not a deployable template. Initialize the public pages through the
CMS onboarding or an explicit migration before announcing the hub. There is no
code-rendered catalog fallback.

The standard deployment applies end-user package-download limiting at the CMS
Delivery gateway. Server-to-server repository calls do not carry
`X-Forwarded-For`, so the internal listener explicitly uses
`CMS_HTTP_CLIENT_ADDRESS_MODE=disabled`; configuring one trusted hop here would
reject every normal CMS fetch as an invalid forwarding chain. If an operator
later places a real forwarding proxy directly in front of this listener,
`trusted-proxy` becomes valid and the hop count includes that proxy plus every
preceding CDN. `direct` is suitable only when callers connect without a proxy.

## CMS-authenticated management from a remote CLI

The standalone repository management listener remains internal. Do not attach
it to `cms_proxy`, add a raw `3000:3000` mapping, or place a second public proxy
in front of it: port 3000 also carries the separately authenticated maintenance
and verifier protocols.

Remote operators use the Ulvia CLI against the designated manager's normal
HTTPS Control origin. Create a Personal Access Token from the CMS Profile page
and expose it only to the publication process as `ULVIA_TOKEN`. The PAT
identifies one CMS user; the gateway reloads that user's current role on every
request and permits repository management only while it is `admin`.

Publication needs no repository service credential on the workstation:

```bash
ULVIA_URL=https://admin.integrations.example.com \
ULVIA_TOKEN=pat_example \
bun run ulvia -- push commerce
```

The external path remains `/.cms/repository-management`, but it is mounted by
the CMS Control listener. The gateway uses an exact method-and-path allow-list,
bounds request bodies, limits candidate buffering to one concurrent upload,
and cancels a stalled body read after two minutes. It removes the operator's
`Authorization` header and authenticates its private upstream request with the
file mounted by `repository-hub.override.yml`. Maintenance baseline/backfill
endpoints, verifier worker endpoints, health probes, and public catalog reads
are not exposed by this gateway. Demoting the user or revoking the PAT takes
effect without rotating the internal repository credential.

The authenticated identifier is retained on the candidate and its bounded
pruned-candidate audit record. It is not yet a permanent publisher signature;
durable third-party publisher identity and signing remain a separate trust-model
upgrade.

## Empty-volume initialization

The image contains no integration seed. Starting with an empty registry mount
serves an empty catalog; startup never imports source files, reconstructs old
packages, or changes an initialized catalog. Initialize a new repository by
releasing current sources into a trusted Ulvia local repository and publishing
them through the authenticated candidate protocol. Restore an existing
repository only from a complete registry backup.

After initialization:

- image upgrades never reconcile or mutate registry contents;
- `docker compose pull` cannot publish a version;
- official updates go through authenticated, locked, auditable publication.

This rule makes the registry volume, not Git or image contents, the source of
truth. Pulling a newer image does not merge newly authored resources.

### Publishing one integration

An integration is built and fully verified before it enters the persistent
local repository. Pull remote history first when the machine does not already
have the required baselines:

```bash
bun run ulvia -- pull commerce --all-versions
bun run ulvia -- audit commerce --root packages/resources/official-integrations/integrations
bun run ulvia -- release commerce --root packages/resources/official-integrations/integrations
ULVIA_URL=https://admin.integrations.example.com \
ULVIA_TOKEN=pat_example \
bun run ulvia -- push commerce
```

The local release contains the canonical package and its digest. The remote
repository rebuilds the authoritative verification plan from its own catalog,
runs it in server-owned disposable infrastructure, and publishes only after
admission succeeds. Existing coordinates are immutable: identical bytes are an
idempotent no-op and different bytes require a new version.

Stable promotion, emergency blocking, and compatibility reevaluation remain
separate compare-and-swap management operations. They currently have no public
Ulvia CLI command and must not be emulated by editing registry files.

### Publishing the official catalog

The non-interactive publisher first pulls the anonymous remote history, then
audits every checked-in current source without publication credentials:

```bash
bun run ulvia -- pull --all
bun run ulvia -- audit --all \
  --root packages/resources/official-integrations/integrations
```

Actual publication pulls immutable remote history, releases changed sources to
the local repository, and pushes only those local releases whose coordinates
are absent remotely:

```bash
bun run ulvia -- pull --all
bun run ulvia -- release --all \
  --root packages/resources/official-integrations/integrations
ULVIA_URL=https://admin.integrations.example.com \
ULVIA_TOKEN=pat_example \
bun run ulvia -- push --all
```

Keep `ULVIA_TOKEN` scoped to the publication process. A digest conflict,
compatibility rejection, rate limit, invalid response, timeout, or transport
failure returns a non-zero exit status.

`.github/workflows/publish-official-integrations.yml` exposes the same operation
through both `workflow_dispatch` and `workflow_call`. Every run first executes a
credential-free audit on a hosted runner. Normal publication then runs on a
hosted runner through the HTTPS CMS gateway with the `ULVIA_TOKEN` secret,
scoped only to the validation and publication steps. Image builds and pulls
never invoke this workflow automatically. Initial population and every later
official update remain explicit, reviewable publication operations.

The fixed, protected `integration-repository` GitHub environment owns both
destinations as environment variables: `REPOSITORY_CMS_URL` for the public CMS
Control origin and `REPOSITORY_PUBLIC_URL` for anonymous digest verification.
They are deliberately not workflow inputs, so an invoker cannot redirect the
credential to an arbitrary host. The same environment owns the `ULVIA_TOKEN`
secret.

## Probes and shutdown

Both listeners expose `/health` and `/ready`. Liveness reports the process
state. Readiness requires a valid in-memory snapshot. A corrupt entry produces
a ready but degraded snapshot with only aggregate diagnostic counts. If a
later refresh fails, the last valid snapshot stays available and health becomes
degraded. The health check uses the internal management listener without
crossing the management API authentication boundary.

`SIGINT` and `SIGTERM` stop both listeners gracefully. Compose allows 30
seconds before forcing termination.

## Registry backup, restore, and capacity

The `./registry` bind mount is the authoritative publication record. Back it up
independently from CMS media and from every CMS `integration-packages` cache.
To obtain a consistent online-read snapshot, first disable the CMS management
gateway and pause private publication automation so no publication, promotion,
or reevaluation can start. Wait for in-flight management requests to finish,
then archive the whole registry tree while preserving ownership, modes, and
timestamps. Encrypt the archive and copy it off the application host.

Restore only into an empty prepared registry directory owned by UID/GID 1000
with mode `0750`. Restore the complete tree rather than selected indexes or
version directories, then start the repository and inspect `/ready` plus the
authenticated management status and diagnostics before re-enabling the CMS
management gateway or publication automation. If an initial publication is
interrupted, retry it through Ulvia: immutable objects and admitted coordinates
make the operation resumable without editing registry files.

The registry status reports exact decimal byte capacity from the mounted
filesystem. Monitor available space outside the container and retain room for
the largest accepted package, its staging tree, publication journal, and the
backup tool's temporary overhead. The MVP performs no automatic registry or
cache garbage collection.

CMS caches remain reconstructible only while every pinned historical package
is still available from the registry. Their separate backup policy is in
`infra/images/cms/README.md`: back them up when offline reruns must remain
guaranteed, but never treat them as the source of truth for registry recovery.
