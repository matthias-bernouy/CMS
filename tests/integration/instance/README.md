# Instance integration tests

This suite exercises the real Edge, Provider and Repository images with MongoDB
and a Chromium client. It covers MCP OAuth consent, collection publication and
installation, independent Page creation/replacement from examples, content and files, Provider approval and pairing, log isolation,
key rotation, persistence and revocation.

The directory contains test harnesses. Image builds remain in
[`infra/images`](../../../infra/images/build.ts); there is no separate MCP image.

## Run

Run from the workspace root with Bun dependencies, Docker and the Playwright
Chromium browser available. Build a matching set of local images, or use an
already built exact tag:

```sh
bun run images:build --version 0.1.0-integration all

ULVIA_MCP_EDGE_DOCKER_IMAGE=docker.io/cyaxis/ulvia-edge:0.1.0-integration \
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
They can run alongside this suite. The CLI Edge smoke journey exercised by
`bun run verify:full` is a separate integration check.

See [Instance MCP V1](../../../docs/architecture/instance-mcp.md) and
[Provider connections](../../../docs/providers/connections.md) for the runtime
protocols verified here.

## Upgrade regression

Supply `ULVIA_UPGRADE_BASELINE_PROVIDER_IMAGE` and
`ULVIA_UPGRADE_BASELINE_REPOSITORY_IMAGE` with the published `1.0.0` images,
alongside the candidate Provider and Edge variables above. The upgrade case
publishes current releases into its isolated local Repository, provisions the
old instance, then replaces its Provider container and requests profile `1.3.0`, then restarts Edge to negotiate the new control contract.
It checks exact Page content, the existing MCP authorization, log queries and a
subsequent restart. No test publishes to or reads from the public Repository.

## Delivery work budgets

`bun run test:performance:delivery` builds matching candidate images and runs
`performance.docker.test.ts` explicitly. It also runs in `verify:full` and the
CI smoke workflows. The ordinary suite skips this case unless
`ULVIA_RUN_DELIVERY_PERFORMANCE=1`; the explicit runner refuses missing partial
image sets. See [guardrails](../../../docs/development/guardrails.md) for
instrumentation, budgets, timing interpretation and cache freshness limits.
