# Official Repository Server

`@bernouy/official-repository-server` is the production composition root for an
immutable Ulvia repository. It exposes public catalogue and exact-coordinate
reads, authenticated staged publication, reversible yanking and `/healthz`.
It also serves public namespace claims, Ed25519 owner publication, the admitted
`ulvia.repository` contract and `/mcp`. See the
[community Repository architecture](../../../docs/architecture/community-repository.md)
for key lifecycle, client use, transport limits and deployment boundaries.

The authored files under `packages/official-repository` are not read at runtime.
A release pipeline admits them locally and pushes exact coordinates through the
same signed protocol as every other client. This keeps source review, publication
and production storage as separate concerns.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `ULVIA_REPOSITORY_DIR` | yes | Absolute persistent data directory |
| `ULVIA_REPOSITORY_SEED_DIR` | no | Read-only admitted repository snapshot copied when persistent storage is absent or empty |
| `REPOSITORY_HOST` | no | Listen address, default `0.0.0.0` |
| `REPOSITORY_PORT` | no | Listen port, default `3000` |
| `REPOSITORY_PUBLIC_URL` | no | Public HTTPS origin for MCP resource links; defaults to loopback HTTP at the listen port |
| `REPOSITORY_SHUTDOWN_TIMEOUT_MS` | no | Graceful-stop bound, default `10000`, maximum `60000` |

The production runtime requires no operator token. Every namespace, including
`ulvia.official`, uses public first claim followed by owner-signed publication.
Claim intended official publishers locally before exposing the Repository. There is no operator recovery after private-key loss.

TLS must terminate at a trusted reverse proxy or load balancer. Do not expose
plain HTTP outside the private deployment network. Configure the proxy to allow
100 MiB request bodies and enough time for a raw asset upload. Set
`REPOSITORY_PUBLIC_URL` to the external HTTPS origin when using a proxy;
request and forwarded headers never select the resource origin.

The current filesystem adapter deliberately supports one active server replica
over one persistent local volume. The volume must preserve atomic exclusive
create, rename and hard-link semantics. Upload sessions, replay claims, yanks
and immutable artifacts all live on that volume. Horizontal or cross-region
deployment requires shared atomic implementations of the registry, upload store
and replay store; do not point multiple replicas at unrelated disks.

When `ULVIA_REPOSITORY_SEED_DIR` is configured, startup copies and validates the
snapshot in a staging directory if `ULVIA_REPOSITORY_DIR` is absent or empty.
An absent directory is installed by renaming the staged root;
an existing empty mount receives staged entries individually. A non-empty
repository is never overlaid, so restarts preserve published artifacts, yanks
and receipts. Replacing the image does not add new bundled releases to existing
storage. Backup and verified recovery remain
[open operational work](../../../docs/TODO.md#backup-and-operational-recovery).

Startup verifies that the resulting directory is a real writable directory and
re-reads all stored catalogues before accepting traffic. It then prunes expired upload
sessions and only those hash-addressed binary directories that no immutable
release references. Corrupt artifacts therefore fail the deployment instead of
producing a partially available repository.

The server holds a edge `flock` on `.server-lock` through a child whose input
pipe belongs to the server. A server crash closes the pipe and releases ownership;
container restarts do not depend on PIDs or a stale interval. The deployment
must provide `flock` (included in the runtime image). Competing servers fail
before recovery or listening; losing the ownership child stops the listener.

Mutation locks are renewable owner- and process-identified leases. A stale lease
is recovered only after its owning local process has disappeared. Immutable
files, mutable metadata and commit receipts are flushed before their containing
directory entries are exposed. These guarantees assume the documented
single-host, single-active-replica filesystem deployment; they are not a
distributed consensus protocol.

## Local container regression test

Build the candidate image locally, then run the real-image tests without pushing:

```sh
bun run infra/images/build.ts build --version 0.1.0-community.0 repository
ULVIA_REPOSITORY_DOCKER_IMAGE=docker.io/cyaxis/ulvia-official-repository:0.1.0-community.0 bun test ./tests/images/official-repository
```

The test uses temporary bind storage, rejects a competing replica, publishes
a fixture through owner credentials, checks MCP links and restarts with both
`TERM` and `KILL`. It verifies immutable bytes and namespace identity with the
same reused container PID, then removes its containers and temporary storage.
