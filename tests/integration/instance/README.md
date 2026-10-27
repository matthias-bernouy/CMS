# Instance integration tests

This suite exercises the real Kernel, Provider and Repository images with MongoDB
and a Chromium client. It covers MCP OAuth consent, collection publication and
installation, content and files, Provider approval and pairing, log isolation,
key rotation, persistence and revocation.

The directory contains test harnesses. Image builds remain in
[`infra/images`](../../../infra/images/build.ts); there is no separate MCP image.

## Run

Run from the workspace root with Bun dependencies, Docker and the Playwright
Chromium browser available. Build a matching set of local images, or use an
already built exact tag:

```sh
bun run images:build --version 0.1.0-integration all

ULVIA_MCP_KERNEL_DOCKER_IMAGE=docker.io/cyaxis/ulvia-kernel:0.1.0-integration \
ULVIA_MCP_PROVIDER_DOCKER_IMAGE=docker.io/cyaxis/ulvia-provider:0.1.0-integration \
ULVIA_REPOSITORY_DOCKER_IMAGE=docker.io/cyaxis/ulvia-official-repository:0.1.0-integration \
bun test ./tests/integration/instance
```

Without all three image variables, normal `bun test` and `bun run verify` discover
the integration case and skip it. The suite creates its own loopback ports,
credentials, containers and network, uses only a local Repository, and removes
its own resources on completion.

The Repository-specific image lifecycle tests remain in
[`tests/images/official-repository`](../../images/official-repository).
They can run alongside this suite. The CLI Kernel smoke journey exercised by
`bun run verify:full` is a separate integration check.

See [Instance MCP V1](../../../docs/architecture/instance-mcp.md) and
[Provider connections](../../../docs/providers/connections.md) for the runtime
protocols verified here.
