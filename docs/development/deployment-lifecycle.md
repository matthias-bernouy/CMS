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
| `upgrade [--version VERSION] [--plan] [--backup-directory PATH]` | Plan or perform a protected, cold-backup upgrade with image-owned migrations. Pending configuration must be applied first. |
| `backup create PATH` | Stop services, capture and verify the entire installation, then reopen it if it was running. PATH must be a new absolute directory outside the installation. |
| `backup verify PATH` | Verify the snapshot, deployment artifacts and availability of exact images without modifying business data. |
| `backup restore PATH --yes` | Replace installation data and restart the exact saved deployment. All writes since the checkpoint are discarded. |

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

All image acquisition precedes business-service replacement. MongoDB major changes
and downgrades require an explicit migration. Initial apply and configuration-only
apply keep their recorded deployment recovery; they do not create automatic data
backups. A pending upgrade from a CLI without the maintenance journal must be
finished with that original CLI or recovered using an explicit complete backup.

## Protected upgrades and complete rollback

`ulvia upgrade --version VERSION --plan` runs the target image's bounded, read-only
maintenance planner against the running installation. It may acquire images and
prepare private deployment artifacts, but does not stop services or change CMS
state. Its result is provisional: upgrade recomputes it after stopping writers.
The image must advertise maintenance API v1; arbitrary user migration scripts are
never loaded. Unknown recipes, unsupported exact releases, active transitions and
incompatible consumers refuse explicitly.

A normal upgrade takes both installation and local Repository native write locks,
records `.maintenance.json`, stops all services, captures a cold checkpoint and
verifies it. The default destination is a new private directory next to the data
root, under `<data-root>.backups/`. `--backup-directory` selects a new absolute
external directory. A missing or incomplete receipt cannot authorize restoration.

Only MongoDB is reopened for the target image's maintenance plan and approved
recipes. The planner scans logical instances independently; no shared database
transaction across Providers is assumed. Source fingerprints are checked before
conversion. An interrupted multi-document migration is recovered by restoring the
whole cold checkpoint, rather than inferring which writes completed.

The new Provider starts with a mounted maintenance marker. Business HTTP requests,
instance/operation recovery, Forms/Event/Workflow recovery and TLS reconciliation
remain paused. Health/readiness probes and the authenticated technical domain
routing query remain available so new Edges can pass readiness checks. The gate
adds one cached boolean read per request and one filesystem probe per process per
100 ms; it is not an administration authorization mechanism.

After Provider/Edge startup checks, the CLI durably records `opening`, releases the
gate, waits for activation acknowledgement, opens the proxy and commits applied
state after full Compose health. Background business effects can begin when the
gate is released, even before the proxy opens. Therefore **automatic rollback is
allowed only before `opening`**. Earlier failure restores Mongo, files, keys and
exact old deployment together. At/after `opening`, failure preserves the target
and journal; `ulvia upgrade` resumes that exact target without recopying old data.
`status` and `logs` remain available during recovery.

An operator can explicitly request `ulvia backup restore PATH --yes`, including
after activation. This discards subsequent local writes and cannot retract emails
or other external effects. Interrupted restores retain their journal. Once old
services may have reopened, retry only finishes opening; it never recopies the
checkpoint over possible new writes. Native root/Repository lock inodes survive
restoration. Recovery can stop owned containers even if interrupted copying
removed live Compose artifacts.

A backup contains the entire data root: cold Mongo files, CMS files, encryption
keys, credentials, local catalogue, certificates, desired settings and immutable
Compose/environment snapshots. Its private receipt records inventory SHA-256,
file count, bytes, deployment identity and version; every payload file is hashed.
Links, special files, hard-linked regular files, invalid paths, changed files and
extra payload entries refuse. Capture inventories at most 50,000 entries, a 64 MiB
manifest and 1 TiB per file, with 1 MiB streaming hash buffers and an upfront free
space check. Snapshots are sensitive plaintext, with directories 0700 and files
0600; protect and retain them as credentials. No automatic backup pruning occurs.

Restoration currently targets the **same absolute installation data path**. The
snapshot records exact Provider/Edge and infrastructure image digests, but does not
export Docker image archives. Those exact images must be cached or retrievable;
availability and all hashes are checked before stopping/replacing live data. No
tag substitution is allowed. Independent CLI publisher/PAT configuration outside
the data root is not included. External Providers, SMTP services, remote files or
other independently hosted systems are not captured by this local checkpoint.

The trusted copy worker runs from the recorded Provider image, with no network,
a read-only root and only the required bind mounts and filesystem capabilities.
It is labelled as an owned helper so interrupted writers can be stopped before
recovery. Operator access to Docker and the private installation remains the
backup/restore authority; these commands are not exposed as tenant capabilities.

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
The [maintenance tests](../../packages/runtimes/ulvia-cli/tests/stack/maintenance)
cover payload integrity, private files, locks, explicit restoration and refusal paths.
The [logging tests](../../packages/runtimes/ulvia-cli/tests/stack/logging/logs.test.ts)
cover filters, unauthenticated technical reads, cancellation and oversized lines.
The [native browser journey](../../packages/runtimes/ulvia-cli/tests/stack/edge-smoke.browser.test.ts)
uses actual containers and native CMS setup, captures and restores a complete cold checkpoint, verifies persisted CMS state
after reopening, and applies a second Edge. `bun run verify` also runs delivery and ACME acceptance checks.
