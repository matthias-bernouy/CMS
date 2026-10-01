# @bernouy/cms-dashboards

Site dashboard records and dashboard-to-subject assignments. A dashboard mounts
collection-owned HTML views; it does not own their content. Collection releases
can define dashboards, while this feature stores per-site activation and members.

## Boundaries

- Root export exposes dashboard and assignment contracts and memory repositories.
- `@bernouy/cms-dashboards/mongo` exposes Mongo repositories for composition roots.
- Do not import surfaces, runtimes, or concrete source repositories.

## Rules

- Keep HTML views in collection releases and site dashboard navigation here.
- Do not reintroduce widgets or embed provider endpoints in dashboards.
