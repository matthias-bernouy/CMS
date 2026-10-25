# Install Ulvia

This guide installs the Ulvia CLI and creates a first CMS instance on Ubuntu.
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
