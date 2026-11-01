# @bernouy/logging

CMS-agnostic structured diagnostics with bounded attributes and central
redaction.

## Public API

- `@bernouy/logging` exposes logger contracts, levels, child loggers, the
  sanitizer and an in-memory implementation.
- `/node` exposes structured stdout/stderr sinks and `nodeLogOutputStats()` for composition roots.
- `/testing` exposes explicit no-op and test helpers.

Runtimes choose service names, levels and formats. Infrastructure owns stdout/stderr retention.
Request correlation is supplied by `@bernouy/http-runner/observability`; this
package does not read environment variables or create a global logger. Every
structured attribute passes through the shared sanitizer.

Node sinks share a process-wide queue bounded to 1,000 pending entries / 1 MiB.
They respect stdout/stderr backpressure independently, prioritize errors and
fatal records under saturation, and report known drops without blocking callers.
Loss summaries are JSON even when normal operator output uses the pretty format.
An accepted stream write is not a durable acknowledgement; infrastructure owns
retention, and pending entries can be lost on process exit.

Diagnostic logs are not durable audit records, metrics or traces. Never log
credentials, cookies, tokens, request bodies, personal data or provider inputs.

See the [development logging guide](../../../docs/development/README.md#runtime-logs)
and [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
