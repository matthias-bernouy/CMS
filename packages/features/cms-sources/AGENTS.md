# @bernouy/cms-sources

Feature package for data sources, endpoint contracts, request execution, and
source proxy helpers.

## Boundaries

- Root export exposes source/endpoint types, validation, repositories, request
  execution, system sources, and source HTTP helpers.
- `@bernouy/cms-sources/browser` is browser-safe.
- `@bernouy/cms-sources/mongo` exposes the Mongo repository for composition
  roots.

## Rules

- Header policy is security-sensitive. Keep forbidden request headers blocked.
- Secrets are resolved through injected `SourceSecretResolver`; do not read a
  secret store directly from core execution.
- Source validation should reject invalid URLs, duplicate endpoint URNs,
  invalid headers, and malformed data shapes.
- System sources use reserved ids/URNs and must remain readonly to user CRUD.
