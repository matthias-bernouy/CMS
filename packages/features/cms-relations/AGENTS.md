# @bernouy/cms-relations

Feature package for declarative relation contracts, relation repositories, and
bounded relation runtime helpers.

## Boundaries

- Root export exposes relation contracts, validation, in-memory repositories, and
  runtime page resolution.
- `@bernouy/cms-relations/mongo` exposes Mongo persistence for composition roots.
- This package may depend on published `@bernouy/cms-sources` exports for source
  contracts and endpoint execution.
- Do not import integrations, dashboards, surfaces, or runtimes.

## Rules

- Relations are semantic contracts, not implicit full response expansion.
- `many` relations must declare bounded pagination.
- Runtime helpers must not hide unbounded N+1 behavior. Keep link-table target
  hydration explicit and bounded when added.
