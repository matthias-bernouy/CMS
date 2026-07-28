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
numeric identities; the isolated preflight rejects any mismatch. The Ed25519
private key signs short-lived sandbox capabilities and only the sandbox receives
the public key:

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

chmod 0600 secrets/*
sudo chown 1000:1000 \
  secrets/repository-management-token \
  secrets/repository-maintenance-token \
  secrets/repository-worker-token \
  secrets/repository-worker-capability-key
sudo chown 1001:1001 \
  secrets/verifier-worker-token \
  secrets/verifier-sandbox-ed25519-private.pem \
  secrets/verifier-postgres-password
sudo chown 70:70 secrets/verifier-postgres-server-password
sudo chown 1002:1002 secrets/verifier-sandbox-ed25519-public.pem
sudo chmod 0444 secrets/verifier-sandbox-ed25519-public.pem

cp .env.example .env
```

Set all three image identities in `.env`: `CMS_REPOSITORY_IMAGE` to the
repository tag or digest, `CMS_INTEGRATION_VERIFIER_IMAGE` to
`${VERIFIER_IMAGE}`, and `CMS_INTEGRATION_VERIFIER_RUNNER_IMAGE_DIGEST` to
`${VERIFIER_DIGEST}`. Keep the secret-file paths from `.env.example`, then
validate and start the complete repository, verifier, sandbox, and disposable
PostgreSQL stack:

```bash
docker compose config --quiet
docker compose up -d --wait
```

Compose intentionally refuses to create `./registry` on the operator's behalf.
This prevents Docker from silently creating a root-owned bind directory that
the UID/GID 1000 runtime cannot write. Run the preparation commands above before
the first `docker compose up`.

The root filesystem is read-only. The dedicated `./registry` bind mount is the
only durable writable location; `/tmp` is owned by UID/GID 1000, bounded,
non-executable, and erased on restart. Back up the registry volume independently
from CMS media and package caches.

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
official releases through the normal candidate workflow described below; the
hub pins the post-bootstrap
`documentation-blocs@1.0.0` release. Then deploy
`packages/resources/sites/cms-repository-hub` to this CMS before announcing the
public hub, following the
[official-sites deployment runbook](../../../packages/resources/sites/README.md).
Until that explicit `p9r push` succeeds, `/integrations` returns the site's
normal not-found response. There is deliberately no code-rendered catalog
fallback: the public UI is entirely made of CMS pages, integrations, and Blocs.

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

Remote operators use the existing CMS CLI authentication mechanism against the
designated manager's normal HTTPS Control origin. Create a Personal Access Token
from the CMS Profile page and store it through the standard `P9R_TOKEN` or
`~/.config/p9r/credentials.json` mechanism. The PAT identifies one CMS user; the
gateway reloads that user's current role on every request and permits repository
management only while it is `admin`.

With the PAT stored for the manager CMS URL, publication needs no repository
service credential on the workstation:

```bash
P9R_URL=https://admin.integrations.example.com \
p9r repository publish /path/to/integration
```

The external path remains `/.cms/repository-management`, but it is mounted by
the CMS Control listener. The gateway uses an exact method-and-path allow-list,
bounds request bodies, removes the operator's `Authorization` header, and
authenticates its private upstream request with the file mounted by
`repository-hub.override.yml`. Maintenance baseline/backfill endpoints,
verifier worker endpoints, health probes, and public catalog reads are not
exposed by this gateway. Demoting the user or revoking the PAT takes effect
without rotating the internal repository credential.

## Empty-volume bootstrap policy

On first startup only, the default image builds the closed historical bootstrap
set of 14 official packages with the shared canonical package builder and
prevalidates the entire publication plan before writing to a completely empty
registry bind mount. Later checked-in releases are published through the normal
explicit workflow; image startup never reconciles them into an initialized
volume. A separate, explicitly privileged bootstrap publisher admits the nine
legacy SQL packages that predate `compatibility.schema`; the normal management
publisher remains strict and cannot use that exemption.

After preflight, the runtime durably creates
`.official-bootstrap-in-progress`, publishes the prepared packages through the
normal immutable index and snapshot machinery, and removes the marker only
after every expected kind, version, and digest was committed. If publication
is interrupted, the marker remains and every later startup fails closed instead
of serving a partial seed. Do not remove only the marker. Archive the partial
fresh-volume contents for diagnosis, replace them with a new empty mode-0750
registry directory owned by UID/GID 1000, and restart the same immutable image.

Any non-empty registry without that marker is already initialized and is left
untouched by bootstrap. After initialization:

- image upgrades never reconcile or mutate registry contents;
- `docker compose pull` cannot publish a version;
- official updates go through authenticated, locked, auditable publication.

This rule deliberately makes the registry volume, not later image contents, the
source of truth. Pulling a newer image does not merge newly bundled resources.

### Publishing one integration

`p9r repository publish` reads the integration index at the supplied root; no
version flag is accepted because the versions are already declared there. It
builds the complete immutable package for every declared version, including
SQL, functions, text assets, and binary assets, then processes them in ascending
SemVer order:

```bash
p9r repository publish /path/to/integration --dry-run
p9r repository publish /path/to/integration
```

Every version published through this generic command must also provide a valid
`cms.integration.verification.v1` document at
`verification/<version>.json`, outside the corresponding `versions/<version>/`
runtime package. The document targets the exact package digest, retains the
`cms-postgres` `^1.0.0` runner requirement, and declares at least one author
contract or conformance suite. Its source closure is validated before upload;
putting an undeclared test under the runtime version directory does not make it
an executable admission test. The source JSON may be formatted for humans; the
CLI canonicalizes the combined candidate before hashing and upload.
When authoring a new bundle, a temporary 64-zero package digest is sufficient
to make the document structurally valid: `--dry-run` then reports the exact
`package-sha256` expected for that version. Replace the placeholder and rerun;
any later runtime-package change intentionally makes that binding stale again.

An absent version enters the normal candidate verification and publication
workflow. An existing coordinate with the same package digest is reported as
`UNCHANGED` and skipped, even if its later release state is blocked or no longer
admissible. The same coordinate with different bytes is an immutable-version
conflict and returns `409`; any hard failure stops the remaining versions.
Stable promotion and emergency blocking remain explicit management operations,
separate from publication.

### Publishing the official catalog

The non-interactive publisher builds every checked-in official version with the
shared canonical package reader before making any request. A credential-free
validation is available from the workspace root:

```bash
bun run packages/runtimes/cms-cli/src/index.ts \
  repository publish-official --dry-run
```

Actual publication uses the same manager CMS URL and administrator PAT as a
workstation publication. The CLI derives the management gateway path; it never
needs the internal repository URL or service credential:

```bash
P9R_URL=https://admin.integrations.example.com \
P9R_TOKEN=pat_example \
bun run packages/runtimes/cms-cli/src/index.ts repository publish-official
```

Prefer the normal credentials store over an inline `P9R_TOKEN` on an operator
machine. The environment form is useful for a secret-scoped CI step.

Packages are published sequentially by kind and ascending SemVer. Re-running
the command is idempotent only when the registry's immutable existing digest
exactly matches the rebuilt package. A digest conflict, compatibility rejection,
rate limit, invalid response, timeout, or transport failure returns a non-zero
exit status.

`.github/workflows/publish-official-integrations.yml` exposes the same operation
through both `workflow_dispatch` and `workflow_call`. Every run first executes a
credential-free plan on a hosted runner. The privileged baseline and legacy
backfill step stays on the private self-hosted `repository-management` runner
with its separate `REPOSITORY_MAINTENANCE_TOKEN`; it writes that credential to
an ephemeral mode-0600 file and removes it afterward. Normal publication runs
on a hosted runner through the HTTPS CMS gateway with the `P9R_TOKEN` secret,
scoped only to the validation and publication steps. Image builds and pulls
never invoke this workflow automatically. The first empty-volume seed is
performed locally by the repository runtime; every later official update
remains an explicit, reviewable publication operation.

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
management gateway or publication automation. A bootstrap-in-progress marker is
recovery evidence, not a file to delete blindly; an interrupted initial seed
should be investigated or the still-new volume replaced from a known-good
backup.

The registry status reports exact decimal byte capacity from the mounted
filesystem. Monitor available space outside the container and retain room for
the largest accepted package, its staging tree, publication journal, and the
backup tool's temporary overhead. The MVP performs no automatic registry or
cache garbage collection.

CMS caches remain reconstructible only while every pinned historical package
is still available from the registry. Their separate backup policy is in
`infra/images/cms/README.md`: back them up when offline reruns must remain
guaranteed, but never treat them as the source of truth for registry recovery.
