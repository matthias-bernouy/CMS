# CLI deployment lifecycle

The root deployment commands separate desired settings, the last successful
installation and a resumable operation. CMS instance creation remains behind
Control's Hosting capabilities. The CLI manages the shared infrastructure.

| Command | Effect |
| --- | --- |
| `configure [options]` | Persist desired settings without Docker calls. No arguments starts a terminal-only guided configuration; `--show` reads settings. |
| `apply [--version VERSION]` | Initial deployment or reconciliation using the recorded release. An already running matching installation is a no-op. |
| `start` | Start existing containers with the last applied snapshot. Missing containers require apply; pending deployments require their recorded recovery. |
| `stop` | Stop the applied and pending deployment services, retaining their data. |
| `status` | Show actual service/image state, the last applied release, pending configuration, recovery phase and Control HTTP/HTTPS accessibility. |
| `logs [--filter FIELD=VALUE] [--follow]` | Read technical Docker logs scoped to this installation, independently of CMS login. |
| `upgrade [--version VERSION]` | Deploy the co-versioned Provider/Edge and the release's Caddy/MongoDB definitions. Pending configuration must be applied first. |

`services`, component upgrades, `start --version`, `start --domain` and the
`configure network/hosting` subcommands have no forwarding aliases.

## Persistent state

`services/installation.json` stores desired settings. `services/stack.json`
requires an `applied` snapshot or a pending `operation`, with the other field
explicitly null when absent. An operation stores its kind, phase and exact target.
Applied state is changed only after Compose reports successful activation. The
first intent is persisted before Docker can create database state.

Each `services/deployments/<id>/` directory contains the release's Compose files,
MongoDB provisioning script, generated shared Edge/proxy configuration and the
private environment used for that deployment. Files are 0600 in private
directories and their complete contents are checked against the recorded digest.
Secrets are not printed by help, status or configuration inspection. Snapshots
are retained for operator recovery and belong in the matching installation backup.

A new CLI never substitutes its definitions when starting an existing deployment.
It performs no image pull or configuration generation on `start`. Missing or
altered snapshot files, required credentials or malformed state refuse explicitly.
Older flat launch-state records are not imported or backfilled. Network settings
and Control origin remain locked after the first deployment; supported hosting
changes become pending until apply.

## Releases and recovery

The CLI build requires the CLI and stack distribution versions to match. The npm
archive ships `dist/stack-release.json` and embeds the same release. That object
contains exact Compose/provisioning source, pinned Caddy/MongoDB images and a
canonical SHA-256 digest. Initial source-checkout apply can use local definitions
with an explicit image version; a distributed CLI normally uses its embedded
release.

An explicit other version is resolved from the official `@cyaxis/ulvia` npm
metadata. The downloader validates package/version audience, fixed registry and
tarball path, refuses redirects, bounds metadata to 64 KiB and compressed archives
to 16 MiB, verifies registry SHA-512, and bounds decompression to 64 MiB. It reads
one bounded regular tar member in memory and never extracts arbitrary paths.
The inner stack version, schema, file inventory and digest must match. The
registry/publisher is the software supply-chain authority; the internal digest is
an integrity check, not an independent publisher signature.

All image acquisition precedes business-service replacement. Provider retained
execution is checked before replacing it. MongoDB is made available, then the
Provider, individual Edges and proxy are reconciled, followed by a full Compose
health check. MongoDB major changes and downgrades require an explicit migration.
A failure retains the target and phase while leaving the last successful snapshot
identifiable. Services can already be mixed, so status also reports their actual
images. Resume with the recorded `apply` or `upgrade`; this recovery does not
restore database/file contents and does not promise zero interruption.

## Technical logs

Filters support `component=provider|edge|proxy|mongo`, an exact `service` such as
`edge-2`, and exact `level=trace|debug|info|warn|error|fatal`. Different fields use
AND; repeated values of one field use OR. MongoDB severity letters and Caddy's
warning level are normalized. Unstructured lines are visible without level filters.
The last 200 lines of each selected container are streamed. At most 64 owned
containers and 64 KiB per line are accepted. SIGINT/SIGTERM cancels all Docker log
clients. A following reader does not hold the installation mutation lock.

## Verification

The [deployment tests](../../packages/runtimes/ulvia-cli/tests/stack/deployment)
cover snapshot preservation across a newer compiled CLI, pending configuration,
missing containers, refused corruption, npm integrity and interrupted upgrades.
The [logging tests](../../packages/runtimes/ulvia-cli/tests/stack/logging/logs.test.ts)
cover filters, unauthenticated technical reads, cancellation and oversized lines.
The [native browser journey](../../packages/runtimes/ulvia-cli/tests/stack/edge-smoke.browser.test.ts)
uses actual containers and native CMS setup, restarts the installation and applies
a second Edge. `bun run verify:full` also runs delivery and ACME acceptance checks.
