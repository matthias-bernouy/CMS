# @bernouy/logging

Generic structured diagnostics for runtimes and reusable packages.

- Keep the package independent from CMS concepts and environment variables.
- Callers choose service names, levels, formats, stdout/stderr destinations.
- Never expose raw secrets. All structured attributes pass through the central sanitizer.
- Durable domain audit records do not belong here.
- Browser telemetry does not belong in the Node adapter.
