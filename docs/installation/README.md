# Install Ulvia

This guide describes the shared-hosting implementation in this checkout. Use a
CLI release paired with Provider and Edge images supporting hosting API v1;
older images using the per-site Edge model are incompatible. See
[shared-hosting verification](../architecture/shared-hosting.md) for the current
integration coverage and deployment limits.

## 1. Prepare the server

Install Docker Engine, its Compose plugin and Bun. The workspace toolchain uses
Bun 1.4.4. Docker must run and be accessible to the account launching Ulvia.

- [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Docker Compose plugin](https://docs.docker.com/compose/install/linux/)
- [Docker Linux post-installation](https://docs.docker.com/engine/install/linux-postinstall/)
- [Bun installation](https://bun.com/docs/installation)

```bash
docker version
docker compose version
bun --version
```

Install the chosen compatible CLI release with
`bun add --global @cyaxis/ulvia@CLI_VERSION`, replacing `CLI_VERSION` with its
exact version. Workspace contributors can use `bun run ulvia --` instead;
see [development](../development/README.md).

## 2. Start a local installation

```bash
ulvia configure --domain control.localhost --edges 1
ulvia apply
ulvia status
```

A packaged CLI contains its exact initial stack version. Workspace source needs
`ulvia apply --version STACK_VERSION`, with an exact version of locally built or
published compatible images. First apply reuses valid cached images and pulls
missing images. It checks component, stack API, hosting API, version and immutable
repository digest. The applied snapshot keeps both image pins, the pinned
Caddy/MongoDB definitions and their configuration. `start` only starts existing
containers from that snapshot. Missing containers require `apply`.

One Compose project contains Provider, MongoDB, Caddy and the shared Edge pool.
The Provider creates Control automatically. Its default address is
`http://control.localhost:5100/.cms/setup`. The CLI announces a private file
containing the initial administrator email and password:

```text
<data>/services/credentials/control-administrator.json
```

Read that file locally to sign in. The CLI prints only its path. Credentials use
mode 0600 in a private directory. A ready restart does not recreate a removed
bootstrap file or reset the account. Preserve infrastructure keys separately
from this one-time administrator bootstrap input.

## 3. Configure Control and create sites

Open Control's `/.cms/setup`, authenticate and choose a Repository. Native setup
supports a custom Repository, the official Repository, or creating a new Registry
on Control. Then explicitly choose an empty site or a published collection recipe.
No console collection, starter, Page or administration application is bundled.
An empty completed site legitimately returns 404 at `/`.

Create sites through Control's admitted `ulvia/cms.hosting` capabilities. The
HTTP binding for `instances.create` is:

```text
POST /.cms/call/ulvia/cms.hosting/hosting/instances.create
```

```json
{
  "requestId": "10000000-0000-4000-8000-000000000001",
  "label": "Example site",
  "origin": "http://example.localhost:5100",
  "administrator": {
    "email": "owner@example.test",
    "password": "replace-with-a-private-password"
  }
}
```

Use an authenticated current Control administrator and the site's ordinary
Origin/session protections. Each new creation needs its own UUID; an exact retry
with the same UUID recovers that operation. Check `instance.status`: provisioning
acceptance alone is not readiness. The contract also exposes bounded listing,
state inspection, disable and domain administration through HTTP/MCP bindings.
An ordinary site's administrator cannot manage hosting.

All logical sites use the shared pool. Their creation launches no additional
process. Sites use native setup with their own accounts and Repository settings.
A collection selected later grants no hosting authority.

## 4. Operate and resize the infrastructure

```bash
ulvia status
ulvia logs --filter component=provider
ulvia logs --filter service=edge-1 --follow
ulvia logs --filter component=proxy
ulvia stop
ulvia start
ulvia configure --edges 2
ulvia apply
```

Stopping services retains data and makes all sites unavailable. Resizing changes
shared Edge processes independently of the number of sites; reducing the count
removes obsolete Edge containers. Domain and instance disable operations belong
to Control's contracts, not container lifecycle commands.

Persistent data defaults to `$XDG_DATA_HOME/ulvia` or `~/.local/share/ulvia`.
`ULVIA_DATA_DIR` explicitly isolates an installation. The CLI keeps hosting/network
configuration, launch intent, exact image pins, database, file storage and private
keys below that directory. Infrastructure mutations share a native process lock.

## 5. Configure a public domain and HTTPS

Before first launch:

```bash
ulvia configure --bind 0.0.0.0 --http-port 80 --tls acme --https-port 443 --acme-email ops@example.com
ulvia configure --domain control.example.com --public-addresses 203.0.113.10
ulvia apply
```

Replace the example domain and address with your deployment values. Point all
A/AAAA records at the configured entrypoints and permit inbound TCP 80/443.
Provider operator access stays on loopback; MongoDB publishes no host port.

The domain is registered during Control bootstrap, before certificate readiness.
Caddy asks the admitted TLS permission binding for authorization. Unknown,
unverified or disabled domains cannot obtain permission. Its certificate store
persists independently of containers. Instance provisioning, DNS/domain readiness,
HTTPS readiness and backend health are distinct; startup reports pending access.

`configure` records desired settings without contacting Docker. `apply` deploys
them; `status` reports pending changes. Interactive `configure` requires a terminal,
while `configure --show` prints desired settings. Network settings and Control
origin lock after the first deployment.
The public-address allowlist can be updated with `configure`, then
`apply`. Explicitly configure operator-owned suffixes with `--managed-suffixes`
only for DNS space controlled by this installation. Other customer domains require
the ownership proof supplied through Control's domain capabilities.

## 6. Update, back up or remove

```bash
ulvia upgrade --version STACK_VERSION
```

Replace `STACK_VERSION` with an exact published distribution version. `upgrade`
without a version uses the release embedded in the CLI. The versioned CLI npm
archive contains `dist/stack-release.json`: the complete Compose definitions and
pinned Caddy/MongoDB images. Explicit other versions are fetched from the official
`@cyaxis/ulvia` npm archive, bounded and verified against its registry SHA-512
integrity. Provider and Edge image labels, compatibility and immutable repository
digests are checked before activation. Publish the CLI and both images with the
same version before offering a release.

Apply pending configuration before upgrading. Upgrades check Provider retained
execution support, update the Provider, replace Edges in sequence and apply the
proxy. MongoDB major changes and downgrades require an explicit migration. A
failed operation retains its target and the previous successful snapshot;
`status` reports actual service/image state and `upgrade` resumes the exact target.
`start` refuses an unfinished operation. Recovery does not restore database or
file contents. Contract and collection upgrades remain separate domain operations.

Stop all shared services before a filesystem backup. Preserve the complete
matching data directory, including MongoDB, file storage and encryption material.
Validate restores in isolation. Missing mandatory settings or keys over existing
state refuse startup; no silent historical import or key regeneration occurs.

```bash
ulvia reset --yes
bun remove --global @cyaxis/ulvia
```

Reset permanently deletes Ulvia-owned installation data and the local release
cache. Removing the CLI alone does not delete data or Docker resources.

## 7. Publish to a Repository

Any logical site can explicitly activate Registry during native setup. It uses
the same Provider, shared Edges and proxy, with its own CMS accounts, catalogue
and namespace ownership. It has no separate Repository image or signing setup.

Ordinary Repository accounts can register/login through `ulvia/cms.access` and
create a personal access token. Supply that token through bounded stdin:

```bash
ulvia repository login https://repository.example.com --token-stdin
ulvia namespace claim example
ulvia release /path/to/resources --recursive
ulvia push all
ulvia repository logout
```

Login pins the Repository origin and identity. Publication refuses cross-origin
credential forwarding and redirects, validates namespace ownership and dependencies,
and does not install resources into any site. Logout removes the saved connection
without revoking its remote PAT. Site Repository settings and CLI publisher
connections are independent.
