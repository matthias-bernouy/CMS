# @bernouy/cms-dashboards

Temporary feature boundary for dashboard-to-subject assignments while the new
collection-owned dashboard contracts are being designed.

## Boundaries

- Root export exposes only the assignment contract and its in-memory repository.
- `@bernouy/cms-dashboards/mongo` exposes only the Mongo assignment repository
  for composition roots.
- Do not import surfaces, runtimes, or concrete source repositories.

## Rules

- Keep this package limited to assignment persistence until the replacement
  dashboard and view contracts land.
- Do not reintroduce widgets, source execution plans, view definitions, or
  dashboard CRUD through this transitional package.
