# Official Repository Image

Build from the workspace root:

```bash
docker build \
  --build-arg IMAGE_VERSION=0.0.1-alpha.1 \
  --build-arg VCS_REF="$(git rev-parse HEAD)" \
  --file infra/images/official-repository/Dockerfile \
  --tag ulvia-official-repository:0.0.1-alpha.1 \
  .
```

Mount a persistent volume at `/var/lib/ulvia-repository` and inject
`ULVIA_REPOSITORY_TOKEN` through the deployment secret manager. Run one active
replica and terminate HTTPS before the container. `/healthz` is the liveness
endpoint and `/readyz` is the readiness endpoint.

The image contains a pre-admitted snapshot of the official resources authored
in this workspace. It copies that snapshot into an empty persistent repository
on first start. Later image upgrades never overwrite an existing repository;
new immutable releases still use the signed publication protocol.
