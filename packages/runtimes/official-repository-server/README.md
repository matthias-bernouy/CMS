# Official Repository Server

`@bernouy/official-repository-server` is the production composition root for an
immutable Ulvia repository. It exposes public catalogue and exact-coordinate
reads, authenticated staged publication, reversible yanking and `/healthz`.

The authored files under `packages/official-repository` are not read at runtime.
A release pipeline admits them locally and pushes exact coordinates through the
same signed protocol as every other client. This keeps source review, publication
and production storage as separate concerns.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `ULVIA_REPOSITORY_DIR` | yes | Absolute persistent data directory |
| `ULVIA_REPOSITORY_TOKEN` | yes | 32–1024 character mutation signing secret |
| `REPOSITORY_HOST` | no | Listen address, default `0.0.0.0` |
| `REPOSITORY_PORT` | no | Listen port, default `3000` |
| `REPOSITORY_SHUTDOWN_TIMEOUT_MS` | no | Graceful-stop bound, default `10000`, maximum `60000` |

TLS must terminate at a trusted reverse proxy or load balancer. Do not expose
plain HTTP outside the private deployment network. Configure the proxy to allow
100 MiB request bodies and enough time for a raw asset upload.

The current filesystem adapter deliberately supports one active server replica
over one persistent local volume. The volume must preserve atomic exclusive
create, rename and hard-link semantics. Upload sessions, replay claims, yanks
and immutable artifacts all live on that volume. Horizontal or cross-region
deployment requires shared atomic implementations of the registry, upload store
and replay store; do not point multiple replicas at unrelated disks.

Startup verifies that the directory is a real writable directory and re-reads
all stored catalogues before accepting traffic. Corrupt artifacts therefore fail
the deployment instead of producing a partially available repository.
