# Global integration repository image

This image runs `@bernouy/cms-repository-server` without MongoDB or S3. It has
two listeners on one dedicated internal Docker network:

- port 3001 serves anonymous repository reads under `/.cms/repository`;
- port 3000 accepts authenticated management routes under
  `/.cms/repository-management`.

Neither listener is published to the host or attached to public ingress. The
designated management CMS joins `cms_repository`: its Delivery side provides
the canonical public origin and its Control side is the only holder of the
management credential. Public reads have no token, including complete package
downloads.

## Build and prepare

Build from the workspace root with an immutable tag:

```bash
docker build --pull \
  --tag bernouy/cms-repository:2026.07.26-1 \
  --file infra/images/cms-repository/Dockerfile \
  .
```

Prepare the deployment directory for the container UID/GID 1000 and create the
management token without putting it in `.env`:

```bash
cd /opt/cms-repository
umask 077
install -d -m 0750 registry secrets
openssl rand -hex 32 | tr -d '\n' > secrets/repository-management-token
chmod 0600 secrets/repository-management-token
sudo chown -R 1000:1000 registry secrets/repository-management-token
cp .env.example .env
```

Set only the immutable image reference in `.env`, then start the service:

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

## Management CMS connection

Run the designated CMS instance with its normal Compose file plus
`management-cms.override.yml`. The override joins the internal network and
mounts the same Docker secret server-side. It also points the CMS runtime at
`http://cms-repository:3001/.cms/repository`, so definition and package
consumption use the global catalog immediately. Delivery provides the canonical
anonymous origin, while authenticated Control operations use the private
`http://cms-repository:3000/.cms/repository-management` listener. The
credential never enters Delivery responses or browser code.

Before applying the override, identify the one administrator by its stable
opaque user `sub` (visible in the Control Users response and detail URL), not by
email, and add these values to that CMS instance's private `.env`:

```dotenv
P9R_INTEGRATION_REPOSITORY_ADMIN_SUBJECT_IDENTIFIER=<opaque-user-sub>
CMS_REPOSITORY_MANAGEMENT_TOKEN_SECRET_FILE=/opt/cms-repository/secrets/repository-management-token
CMS_REPOSITORY_NETWORK_NAME=cms_repository
```

Then render and start the designated CMS with both files. No ordinary CMS uses
this override or receives the management secret:

```bash
docker compose \
  -f /path/to/cms/compose.yml \
  -f /path/to/cms-repository/management-cms.override.yml \
  config --quiet
docker compose \
  -f /path/to/cms/compose.yml \
  -f /path/to/cms-repository/management-cms.override.yml \
  up -d --wait
```

The standard deployment applies end-user package-download limiting at the CMS
Delivery gateway. Server-to-server repository calls do not carry
`X-Forwarded-For`, so the internal listener explicitly uses
`CMS_HTTP_CLIENT_ADDRESS_MODE=disabled`; configuring one trusted hop here would
reject every normal CMS fetch as an invalid forwarding chain. If an operator
later places a real forwarding proxy directly in front of this listener,
`trusted-proxy` becomes valid and the hop count includes that proxy plus every
preceding CDN. `direct` is suitable only when callers connect without a proxy.

## Empty-volume bootstrap policy

The default image never copies official packages into the registry. A fresh
bind mount therefore starts as a valid empty catalog. Official packages are
imported explicitly through the same validated publication workflow as any
other package.

The runtime's bootstrap port invokes an injected importer only when the
registry root has no entries at all. Any existing index, version, journal,
staging directory, or marker makes bootstrap a no-op. After initialization:

- image upgrades never reconcile or mutate registry contents;
- `docker compose pull` cannot publish a version;
- official updates go through authenticated, locked, auditable publication.

This rule deliberately makes the registry volume, not the image tag, the source
of truth.

### Publishing the official catalog

The non-interactive publisher builds every checked-in official version with the
shared canonical package reader before making any request. A credential-free
validation is available from the workspace root:

```bash
bun run packages/runtimes/cms-cli/src/index.ts \
  repository publish-official --dry-run
```

Actual publication requires the private management base URL and an absolute
token-file path. The token file must contain exactly one non-whitespace token
and is never passed as a command-line argument:

```bash
P9R_INTEGRATION_REPOSITORY_MANAGEMENT_URL=http://cms-repository:3000/.cms/repository-management \
P9R_INTEGRATION_REPOSITORY_MANAGEMENT_TOKEN_FILE=/run/secrets/cms-repository-management-token \
bun run packages/runtimes/cms-cli/src/index.ts repository publish-official
```

Packages are published sequentially by kind and ascending SemVer. Re-running
the command is idempotent only when the registry's immutable existing digest
exactly matches the rebuilt package. A digest conflict, compatibility rejection,
rate limit, invalid response, timeout, or transport failure returns a non-zero
exit status.

`.github/workflows/publish-official-integrations.yml` exposes the same operation
through both `workflow_dispatch` and `workflow_call`. Every run first executes a
credential-free plan on a hosted runner. Mutation runs only on a self-hosted
runner labeled `repository-management`, which must have private network access
to the management listener. Store `REPOSITORY_MANAGEMENT_TOKEN` in the selected
GitHub deployment environment; the workflow writes it to an ephemeral mode-0600
file and removes it after the run. Image builds and pulls never invoke this
workflow automatically, so initial seed and every later official update remain
explicit, reviewable publication operations.

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
To obtain a consistent online-read snapshot, first stop or disconnect the
designated management CMS so no publication, promotion, or reevaluation can
start, wait for in-flight management requests to finish, then archive the whole
registry tree while preserving ownership, modes, and timestamps. Encrypt the
archive and copy it off the application host.

Restore only into an empty prepared registry directory owned by UID/GID 1000
with mode `0750`. Restore the complete tree rather than selected indexes or
version directories, then start the repository and inspect `/ready` plus the
authenticated management status and diagnostics before reconnecting the
management CMS. A bootstrap-in-progress marker is recovery evidence, not a file
to delete blindly; an interrupted initial seed should be investigated or the
still-new volume replaced from a known-good backup.

The registry status reports exact decimal byte capacity from the mounted
filesystem. Monitor available space outside the container and retain room for
the largest accepted package, its staging tree, publication journal, and the
backup tool's temporary overhead. The MVP performs no automatic registry or
cache garbage collection.

CMS caches remain reconstructible only while every pinned historical package
is still available from the registry. Their separate backup policy is in
`infra/images/cms/README.md`: back them up when offline reruns must remain
guaranteed, but never treat them as the source of truth for registry recovery.
