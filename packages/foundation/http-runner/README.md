# @bernouy/http-runner

CMS-agnostic HTTP mounting seam with the `Runner` contract, Bun server adapter,
route groups, cache/compression/CSP helpers, and request observability.

## Public API

- `@bernouy/http-runner` exposes server-side runner primitives.
- `/html` contains browser-safe HTML helpers.
- `/observability` contains request instrumentation contracts.
- `/testing` contains the shared local test-server harness.

Applications and runtimes own listener configuration. Consuming features should
mount routes through the runner rather than starting listeners themselves.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
