# Official Repository Image

Build from the workspace root:

```bash
bun run images:build --version 0.0.1-beta repository
bun run images:publish --version 0.0.1-beta repository
```

Mount a persistent volume at `/var/lib/ulvia-repository` and inject
`ULVIA_REPOSITORY_TOKEN` through the deployment secret manager. Run one active
replica and terminate HTTPS before the container. `/healthz` is the liveness
endpoint and `/readyz` is the readiness endpoint.

The image contains a pre-admitted snapshot of the official resources authored
in this workspace. It copies that snapshot into an empty persistent repository
on first start. Later image upgrades never overwrite an existing repository;
new immutable releases still use the signed publication protocol.
