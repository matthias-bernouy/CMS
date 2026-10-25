# Install Ulvia

This guide installs the Ulvia CLI and runs a CMS instance or a standalone
Repository on Ubuntu. For a Repository-only server, follow section 1 and the
standalone Repository procedure in section 9.
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

The current release toolchain targets Bun 1.4.2 or newer. Docker must be running
and accessible to the account that executes `ulvia`.

## 2. Install The CLI

Install the current stable CLI globally from the public npm registry:

```bash
bun add --global @cyaxis/ulvia@latest
ulvia --help
```

If `ulvia` is not found, reopen the terminal and check that `~/.bun/bin` is in
`PATH`, as described by the Bun installation guide.

Use an exact version, for example `@cyaxis/ulvia@0.0.3`, when reproducing an
installation. The `next` tag is reserved for explicitly tested prereleases.

## 3. Create A Local Site

Start the shared infrastructure, then create one named instance:

```bash
ulvia services start
ulvia instance create my-site --label "My site"
ulvia instance credentials my-site
```

The first start uses the exact software version bundled into the installed CLI.
To bootstrap a different exact prerelease explicitly, use
`ulvia services start --version 0.0.1-beta`. This option never upgrades an
existing installation.

The site is available at `http://my-site.localhost:5100`. The credentials
command prints the initial administrator email and password. It never prints
the Provider, Repository, encryption, or instance service secrets.

Ulvia deliberately separates shared services from sites:

| Command | Responsibility |
| --- | --- |
| `ulvia services start` | Starts the proxy, MongoDB, Official Repository, and Provider. |
| `ulvia instance create <name>` | Provisions one Provider tenant and starts its Kernel. |
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
ulvia instance logs my-site kernel
ulvia services stop
```

Stopping containers preserves persistent data. `services stop` also makes every
site unavailable because Kernels depend on the shared Provider and proxy.

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
ulvia upgrade kernel --version 0.0.1-beta
ulvia upgrade provider --version 0.0.1-beta
ulvia upgrade repository --version 0.0.1-beta
```

Ulvia resolves each official Docker Hub tag to an immutable digest and reuses
that digest on subsequent starts. Registry channels such as `next` or `latest`
may identify releases for humans, but an installation never persists or
silently follows those mutable tags.

`upgrade kernel` visits every local Kernel instance in sequence. Upgrades of
Provider and Repository affect shared services. A failed activation attempts
to restart the previous image, but this does not restore changed database or
file contents and is not an atomic rollback across all instances.
Take a complete backup before an upgrade involving persisted data. Internal
schema migrations and interrupted-upgrade/restore drills remain
[open platform work](../TODO.md#internal-persistence-migrations).

## 6. Public Domain And HTTPS

Configure public networking before creating the first instance because the
canonical Kernel URLs become part of Provider provisioning:

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

Repository and Provider management endpoints remain bound to loopback. Only the
shared proxy is exposed publicly.

## 7. Backup, Reset, And Removal

Stop the installation before taking a filesystem-level backup of the Ulvia data
directory. Preserve the complete directory, including MongoDB, files,
credentials, encryption material, Repository state, and instance definitions.
Do not restore only selected secret or database files from different snapshots.

The CLI has no general backup/restore command. Stop each Kernel with
`ulvia instance stop <name>`, then stop shared services before copying their
data. Restore and verify a complete backup in an isolated installation before
treating it as a recovery guarantee; do not rely on image fallback to recover
data. See [operational recovery](../TODO.md#backup-and-operational-recovery).

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
  and instance Kernel logs.
- **Stored encrypted data cannot be opened:** do not generate replacement keys
  over an existing data directory; restore the matching complete backup.

For implementation diagnostics and contributor-only environment overrides, see
the [development and validation guide](../development/README.md).


## 9. Standalone Repository

This is the standard installation on a dedicated Ubuntu server. The CLI owns
one Repository deployment and its HTTPS proxy. No CMS instance, Provider or
database is required.

### Prepare The Server

Complete the Docker Engine, Compose and Bun prerequisites in section 1. The
account running Ulvia must be able to execute `docker version` and
`docker compose version` without `sudo`.

Before enabling HTTPS:

- Point the domain's DNS A record to the server's public IPv4 address.
- Make inbound TCP ports 80 and 443 reachable and available on the host.
- Choose a real email address for certificate registration and renewal notices.

Replace `repository.example.com`, `ops@example.com` and the example namespace
`acme` below with your own values. Install the published CLI version:

```bash
bun add --global @cyaxis/ulvia@0.1.0-beta
ulvia --version
```

The CLI bundles `0.1.0-beta` as its initial stack version. No deployment name or
`global`/`community` qualifier is required.

### Start Locally And Claim The Publisher

Start the Repository before exposing it publicly:

```bash
ulvia repository start
ulvia repository status
curl --fail http://127.0.0.1:5010/readyz
```

The endpoint initially binds only to `127.0.0.1:5010`. Create a local signing
identity and claim the publisher namespace while the server is still private:

```bash
ulvia identity create owner
ulvia repository login http://127.0.0.1:5010 --identity owner
ulvia namespace claim acme
ulvia namespace status acme
```

Save a secure backup of the signing identity before continuing. By default its
private key is `~/.config/ulvia/keys/owner.pem`; preserve the matching client
configuration too. There is no operator recovery after losing every key copy.

Every namespace follows public first claim, including `ulvia.official`. For an
official Repository, claim that namespace instead of `acme` before public access.
There is no reserved-name bootstrap or operator publication token.

### Enable Public HTTPS

Persist the domain and certificate configuration, then apply it:

```bash
ulvia repository configure \
  --tls acme \
  --public-url https://repository.example.com \
  --acme-email ops@example.com

ulvia repository start
ulvia repository status
```

This starts the Repository, a dedicated Nginx proxy and its ACME companion.
Only the proxy publishes ports 80/443; the Repository's host endpoint stays on
loopback. Certificates and renewal state persist with the deployment. Issuance
requires working public DNS and HTTP access to port 80. Container readiness does
not by itself confirm that the public certificate has been issued.

After issuance, verify public access and save the HTTPS connection:

```bash
curl --fail https://repository.example.com/readyz
curl --fail https://repository.example.com/v1/repository
ulvia repository login https://repository.example.com --identity owner
ulvia namespace status acme
```

The Repository identity and namespace ownership must match the local endpoint.
Public catalogue reads need no credentials; writes require the namespace owner's
signature. Login saves the endpoint and verifies the Repository identity. It
does not create a bearer-token session; private keys stay on the signing host.

### Publish Resources

On a signing machine with the owner identity, release an authored resource and
push its exact coordinate:

```bash
ulvia release /path/to/authored-resource
ulvia push contract acme/example.contract@1.0.0
```

The development CLI adds recursive release, inferred push kinds and `push all`:

```bash
ulvia release /path/to/resources --recursive
ulvia push acme/example.contract@1.0.0
ulvia push all
```

Recursive release prepares sources locally. `push all` publishes every
non-yanked release in the local cache to the saved Repository, respecting local
dependency order. It verifies all artifacts and namespace owner keys before
uploading. A failed batch can leave completed publications; rerun it to resume
idempotently. A type is required only when a coordinate matches several local
resource kinds. The published `0.1.0-beta` CLI does not yet include these additions.

The resource's `publisherId` must match the owned namespace. Dependencies must
be released and pushed first. Collections and provider manifests use
`push collection` and `push provider`. Publishing does not install a collection
on a CMS site.

Other authors use `repository login` and `namespace claim` with their own local
identities and namespace names. No environment exports are needed.

### Daily Operations And Upgrades

```bash
ulvia repository status
ulvia repository stop
ulvia repository start
```

Stopping preserves data, identities and certificates. Starts reuse the installed
image digest. To upgrade, use `ulvia repository upgrade --version VERSION`,
replacing `VERSION` with an exact published version. The CLI pulls the tag,
checks the image labels and pins its immutable digest. A failed activation
attempts to restart the previous image; it does not reverse data migrations.
Back up the stopped deployment and signing identities before upgrading.

`identity import NAME --key-file PATH` copies an existing private key into a
managed local identity. Rotation uses `namespace rotate NAMESPACE
--replacement-identity NAME` and requires both owner and replacement keys.
Revocation uses `namespace revoke NAMESPACE --yes` and is permanent.
`repository logout` removes the connection while preserving local keys.

### Configuration And Storage

Client configuration lives in `$XDG_CONFIG_HOME/ulvia` or `~/.config/ulvia`,
overridable with `ULVIA_CONFIG_DIR`. `config.json` contains public keys, private
key-file references and the active connection; PEM files live in `keys/`.
Files use mode 0600 and directories 0700. Setting only `ULVIA_DATA_DIR` isolates
client settings below `<data>/config`.

Deployment data defaults to `$XDG_DATA_HOME/ulvia/repository-service` or
`~/.local/share/ulvia/repository-service`, overridable through `ULVIA_DATA_DIR`:

| Path | Content |
| --- | --- |
| `config.json` | Desired network configuration |
| `service.json` | Installed image digest and last applied configuration |
| `data/` | Repository identity, namespace history, releases and upload/replay state |
| `proxy/` | Certificates, virtual hosts, HTTP challenges and ACME renewal state |

A complete backup includes the stopped deployment and matching signing
identities. `reset --yes` affects the CMS installation and local release cache;
it preserves the independent Repository deployment and client identities.

### Other Network Modes

The standard procedure above uses managed ACME. The CLI also supports:

| Mode | Command | Exposure |
| --- | --- | --- |
| Local | `repository configure --tls local --port 5010` | Loopback HTTP only |
| External proxy | `repository configure --tls external --public-url https://repository.example.com` | Loopback backend; the operator supplies and connects the HTTPS proxy |

Run `repository start` after configuration changes. An external proxy must
forward to the backend, allow 100 MiB assets plus protocol overhead and preserve
request bodies. The CLI's external mode does not configure the operator's proxy
or join its Docker network. The public origin controls resource links; forwarded
headers do not override it.

Local regression tests validate deployment configuration and publication using
temporary repositories. They do not issue public certificates or contact the
official Repository. Contributor-only image builds and Docker regression tests
are separate from the installation procedure:

```bash
bun run infra/images/build.ts build --version 0.1.0-repository.0 repository
ULVIA_REPOSITORY_DOCKER_IMAGE=docker.io/cyaxis/ulvia-official-repository:0.1.0-repository.0 bun test infra/images/official-repository/tests
```
