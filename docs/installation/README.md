# Install Ulvia

This guide installs the Ulvia CLI and runs CMS instances on Ubuntu, including
a Repository application. For a dedicated Repository host, use the same shared
services and follow section 9.
It is for operators and site owners; workspace contributors should use the
[development guide](../development/README.md).

> **Prerelease availability:** `@cyaxis/ulvia` is the official release package.
> Prereleases use the npm `next` tag; stable releases use `latest`.

## 1. Prerequisites On Ubuntu

Ulvia requires a supported Ubuntu host, Docker Engine with the Docker Compose
plugin, and Bun. Follow the upstream instructions rather than copying an
unversioned third-party installation script:

- [Install Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/)
- [Install the Docker Compose plugin on Linux](https://docs.docker.com/compose/install/linux/)
- [Run Docker without `sudo` and configure startup](https://docs.docker.com/engine/install/linux-postinstall/)
- [Install Bun on Linux](https://bun.com/docs/installation)

Docker's Ubuntu packages include the Compose plugin when
`docker-compose-plugin` is installed. Verify the complete toolchain:

```bash
docker version
docker compose version
bun --version
```

The current release toolchain targets Bun 1.4.4 or newer. Docker must be running
and accessible to the account that executes `ulvia`.

## 2. Install The CLI

Install the current stable CLI globally from the public npm registry:

```bash
bun add --global @cyaxis/ulvia@latest
ulvia --help
```

If `ulvia` is not found, reopen the terminal and check that `~/.bun/bin` is in
`PATH`, as described by the Bun installation guide.

Use an exact version, for example `@cyaxis/ulvia@1.0.7`, when reproducing an
installation. The `next` tag is reserved for explicitly tested prereleases.

## 3. Create A Local Site

Start the shared infrastructure, then create one named instance:

```bash
ulvia services start
ulvia instance create my-site --label "My site"
ulvia instance credentials my-site
```

The first start uses the exact software version bundled into the installed CLI.
To select an exact initial version explicitly, use
`ulvia services start --version 1.0.7`. This option never upgrades an
existing installation.

First startup reuses locally cached exact-version images after checking their
component, stack API, version and immutable digest. It downloads missing images.
With the runtime and infrastructure images already present, initial provisioning
can run without Internet access. Explicit image upgrades still pull the requested tag.

The site is available at `http://my-site.localhost:5100`. The credentials
command prints the initial administrator email and password. It never prints
the Provider, Repository, encryption, or instance service secrets.

The Provider uses `https://repo.ulvia.fr` by default for resource discovery
and connected-account publications. The shared stack contains the proxy, MongoDB and Provider. Repository hosting
is selected explicitly on a named CMS instance.

When initializing a node, select another Repository by setting
`CMS_REPOSITORY_URL` on the first configuration or startup command. For an
isolated local installation:

```bash
CMS_REPOSITORY_URL=http://repository:3000 \
CMS_REPOSITORY_ALLOW_INSECURE_HTTP=true ulvia services start
```

Here `repository:3000` is a Repository CMS Edge address reachable from the
Provider containers. Initial provisioning uses the bundled application profile
before the remote catalogue is available.

The selected connection is persisted as `repository.url` and
`repository.allowInsecureHttp` in
`~/.local/share/ulvia/services/installation.json`. Later environment changes
do not replace an existing connection. To change it, update those fields and
run `ulvia services start`. The Provider bundles admitted resources needed for initial provisioning; it
does not need to contact this Repository to bootstrap its shipped profiles.
Remote discovery and publication still require the configured Repository. An
origin remains required in configuration even when it is unavailable at bootstrap.
Creating a Repository instance neither changes that connection nor publishes the
image-owned bootstrap artifacts into its public catalogue.

Ulvia deliberately separates shared services from sites:

| Command | Responsibility |
| --- | --- |
| `ulvia services start` | Starts the proxy, MongoDB and Provider. |
| `ulvia instance create <name>` | Provisions one Provider tenant and starts its Edge. |
| `ulvia instance start <name>` | Restarts an existing instance without provisioning it again. |
| `ulvia start` | Starts shared services and every existing instance; it creates nothing. |

List and inspect the installation at any time:

```bash
ulvia services status
ulvia instance list
ulvia instance status my-site
```

Persistent data lives below `$XDG_DATA_HOME/ulvia` or
`~/.local/share/ulvia`. Commands can be run from any working directory.

## 4. Daily Operations

```bash
ulvia start
ulvia instance stop my-site
ulvia instance start my-site
ulvia services logs all --level warn
ulvia instance logs my-site edge
ulvia services stop
```

Stopping containers preserves persistent data. `services stop` also makes every
site unavailable because Edges depend on the shared Provider and proxy.

## 5. Upgrade Ulvia

Upgrade the host CLI through Bun. Naming `latest` explicitly also replaces an
installation that was originally attached to the `next` channel:

```bash
bun add --global @cyaxis/ulvia@latest
hash -r
ulvia --version
```

Upgrade deployable components independently with exact versions:

```bash
ulvia upgrade edge --version 1.0.7
ulvia upgrade provider --version 1.0.7
```

Ulvia resolves each official Docker Hub tag to an immutable digest and reuses
that digest on subsequent starts. Registry channels such as `next` or `latest`
may identify releases for humans, but an installation never persists or
silently follows those mutable tags.

`upgrade edge` visits every local Edge instance in sequence. A Provider
upgrade affects shared services; Repository instances use those same Provider
and Edge images. A failed activation attempts
to restart the previous image, but this does not restore changed database or
file contents and is not an atomic rollback across all instances.
Take a complete backup before an upgrade involving persisted data. Internal
schema migrations and interrupted-upgrade/restore drills require explicit
implementation and deployment-level verification.

## 6. Public Domain And HTTPS

Configure public networking before creating the first instance because the
public Edge URLs become part of Provider provisioning. The CLI separately configures
a private Gateway callback URL and a unique Docker alias for each instance:

```bash
ulvia configure network \
  --bind 0.0.0.0 \
  --http-port 80 \
  --tls acme \
  --https-port 443 \
  --acme-email ops@example.com

ulvia services start
ulvia instance create website --domain example.com
ulvia instance credentials website
```

Before starting, point the domain's DNS records to the host and allow inbound
TCP traffic on ports 80 and 443. Review Docker's documented firewall behavior:
published container ports can bypass some `ufw` and `firewalld` rules unless
the host policy uses Docker's supported chains.

The Provider operator endpoint remains bound to loopback. A Repository is a
named CMS instance exposed through its Edge and the same shared proxy; it has
no separate management listener.

## 7. Backup, Reset, And Removal

Stop the installation before taking a filesystem-level backup of the Ulvia data
directory. Preserve the complete directory, including MongoDB, files,
credentials, encryption material, Repository state, and instance definitions.
Do not restore only selected secret or database files from different snapshots.

The CLI has no general backup/restore command. Stop each Edge with
`ulvia instance stop <name>`, then stop shared services before copying their
data. Restore and verify a complete backup in an isolated installation before
treating it as a recovery guarantee; do not rely on image fallback to recover
data.

`reset` permanently removes Ulvia-owned local state:

```bash
ulvia reset --yes
```

Remove the CLI separately after stopping or resetting the installation:

```bash
bun remove --global @cyaxis/ulvia
```

Removing the CLI alone does not delete persistent CMS data or Docker resources.

## 8. Troubleshooting

- **Docker permission denied:** complete Docker's Linux post-installation steps,
  then start a new login session.
- **`docker compose` is unknown:** install the official Compose plugin rather
  than the retired standalone `docker-compose` package.
- **Port 5100, 80, or 443 is occupied:** inspect the owner before changing the
  persisted network configuration.
- **An image cannot be pulled:** verify network access and that the requested
  exact Cyaxis image version has been published.
- **An instance returns 503:** check `ulvia services status`, then the Provider
  and instance Edge logs.
- **Stored encrypted data cannot be opened:** do not generate replacement keys
  over an existing data directory; restore the matching complete backup.

For implementation diagnostics and contributor-only environment overrides, see
the [development and validation guide](../development/README.md).


## 9. Repository CMS Instance

A Repository uses the normal Edge, official Provider and MongoDB deployment.
It has its own CMS accounts, namespace ownership, uploads and catalogue. No
separate Repository image or signing-key configuration is required.

For a local installation:

```bash
ulvia services start
ulvia instance create registry --profile repository@1.3.0
ulvia instance status registry
ulvia instance credentials registry
```

The Registry API is available below
`http://registry.localhost:5100/.cms/call/ulvia/repository`. Its public identity
endpoint is `GET /v1/info` relative to that prefix. Ordinary CMS instances do not
expose this contract. The profile starts with an administrator and system APIs,
without any collection or Page. Publish resources through the CLI/API and install
a website explicitly if needed.

For public hosting, configure network exposure and ACME as described in section 6
before creating instances, then create the application on its public domain:

```bash
ulvia instance create registry --domain repository.example.com --profile repository@1.3.0
```

Replace the example domain with a domain routed to this host. The same shared
proxy handles its HTTPS certificate. Provider management remains on loopback.

### Publisher Accounts And Credentials

Registration, password login and PAT management use the normal Access bindings
under `/.cms/call/ulvia/cms.access`. Registration follows the instance policy.
An ordinary account can claim and publish; it does not need CMS administrator
privileges. The protected publisher operations use a shared CMS PAT.

The current API flow is:

1. `POST /signup` with `email` and `password`.
2. `POST /login-password` with the same credentials; retain its session cookies.
3. `POST /personal-access-tokens` with the session cookies and a token `name`.
   An optional `expiresAt` bounds its lifetime. The plaintext token is returned
   only at creation.
4. Supply that token to the CLI using bounded stdin or `ULVIA_REPOSITORY_TOKEN`.

Browser/session mutations use the instance's normal Origin and cookie
protections. Tokens can be listed with `GET /personal-access-tokens` and revoked
with `DELETE /personal-access-tokens/:id` by their owning account.

```bash
ulvia repository login https://repository.example.com --token-stdin
ulvia namespace claim acme
ulvia namespace status acme
ulvia release /path/to/resources --recursive
ulvia push all
```

Each published resource's `publisherId` must match a namespace owned by the
account. Contract, Provider manifest and collection dependencies must be present
before dependent publication; `push all` orders locally available releases.
Publication never installs a collection on a site.

Namespace claims are atomic and limited to 32 owned names per account. Transfer
uses an explicit target account and expected revision. Suspension retains the
name; account deletion is refused while it owns namespaces. Startup does not
reserve or reclaim names, including `ulvia`.

### Restart And Updates

```bash
ulvia instance stop registry
ulvia instance start registry
ulvia services status
ulvia instance status registry
ulvia upgrade provider --version VERSION
ulvia upgrade edge --version VERSION
```

Replace `VERSION` with an exact available image version. The CLI pins image
digests, checks Provider retention before replacing it, and attempts to restore
the previous image if activation fails. Accounts, ownership, releases, Pages and
credentials remain in the normal CMS storage.

A profile change is separate from an image replacement:
`ulvia instance upgrade-profile registry ID@VERSION`. The target must be a
supported explicit transition shipped by the Provider and retain the
`ulvia/repository` application ID. The CLI saves the exact new reference only
after the Provider acknowledges it. Restart never selects a different profile.

Back up the Provider database, file storage, matching encryption credentials and
private instance configuration together, following section 7. The Repository is
part of this installation: `reset --yes` deletes its data with the other CMS
instances. Client `repository logout` removes its saved PAT connection without
revoking the token remotely.

### Contributor Verification

Build Edge and Provider together. The Repository tests create an instance on an
internal Docker network and use ordinary account PATs; they do not publish
images or contact the public Repository.

```bash
bun run images:build --version 0.1.0-integration all
ULVIA_MCP_EDGE_DOCKER_IMAGE=docker.io/cyaxis/ulvia-edge:0.1.0-integration \
ULVIA_MCP_PROVIDER_DOCKER_IMAGE=docker.io/cyaxis/ulvia-provider:0.1.0-integration \
bun test ./tests/images/repository
```
