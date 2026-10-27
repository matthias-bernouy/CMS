# @bernouy/logging

CMS-agnostic structured diagnostics with bounded attributes and central
redaction.

## Public API

- `@bernouy/logging` exposes logger contracts, levels, child loggers, the
  sanitizer and an in-memory implementation.
- `/node` exposes structured stdout/stderr sinks for composition roots.
- `/testing` exposes explicit no-op and test helpers.

Runtimes choose service names, levels and formats. Infrastructure owns stdout/stderr retention.
Request correlation is supplied by `@bernouy/http-runner/observability`; this
package does not read environment variables or create a global logger. Every
structured attribute passes through the shared sanitizer.

Diagnostic logs are not durable audit records, metrics or traces. Never log
credentials, cookies, tokens, request bodies, personal data or provider inputs.

See the [development logging guide](../../../docs/development/README.md#runtime-logs)
and [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
