# Official Repository Image

Build from the workspace root:

```bash
docker build -f infra/images/official-repository/Dockerfile -t ulvia-official-repository .
```

Mount a persistent volume at `/var/lib/ulvia-repository` and inject
`ULVIA_REPOSITORY_TOKEN` through the deployment secret manager. Run one active
replica and terminate HTTPS before the container. `/healthz` is the liveness and
readiness endpoint.

The image contains the server code, not pre-published official releases. The
release pipeline pushes reviewed immutable coordinates after deployment.
