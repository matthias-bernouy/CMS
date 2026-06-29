# @bernouy/cms-permissions

Feature package for CMS permissions, role definitions, grants, and role storage.

## Boundaries

- Root export exposes the permission catalogue, default roles, `can()`, role
  mutation rules, repository contract, in-memory repository, and validating
  repository.
- `@bernouy/cms-permissions/mongo` exposes `MongoRolesRepository` for
  composition roots.
- User-to-role assignment is owned by `@bernouy/cms-auth`; this package owns
  role definitions and grants.

## Rules

- Permission URNs are public contracts. Rename only with migration handling.
- Validate grants and role ids through `mutateRole` helpers.
- Deleting or changing admin-like grants requires tests around last-admin and
  access behavior in consuming packages.
- Keep this package dependency-light and surface-free.
