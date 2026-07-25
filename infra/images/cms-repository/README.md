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
openssl rand -hex 32 > secrets/repository-management-token
chmod 0600 secrets/repository-management-token
sudo chown -R 1000:1000 registry secrets/repository-management-token
cp .env.example .env
```

Set only the immutable image reference in `.env`, then start the service:

```bash
docker compose config --quiet
docker compose up -d --wait
```

The root filesystem is read-only. The dedicated `./registry` bind mount is the
only durable writable location; `/tmp` is bounded, non-executable, and erased
on restart. Back up the registry volume independently from CMS media and
package caches.

## Management CMS connection

Run the designated CMS instance with its normal Compose file plus
`management-cms.override.yml`. The override joins the internal network and
mounts the same Docker secret server-side. The Delivery gateway forwards
anonymous reads to `http://cms-repository:3001/.cms/repository`; its proxy must
overwrite the forwarded-address chain. Control sends approved management
operations to port 3000. The credential must never enter Delivery responses or
browser code. Background CMS consumers use the canonical public read origin,
not an unforwarded direct request to the trusted-proxy listener.

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

## Probes and shutdown

Both listeners expose `/health` and `/ready`. Liveness reports the process
state. Readiness requires a valid in-memory snapshot. A corrupt entry produces
a ready but degraded snapshot with only aggregate diagnostic counts. If a
later refresh fails, the last valid snapshot stays available and health becomes
degraded. The health check uses the internal management listener without
crossing the management API authentication boundary.

`SIGINT` and `SIGTERM` stop both listeners gracefully. Compose allows 30
seconds before forcing termination.
