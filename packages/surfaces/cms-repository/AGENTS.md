# @bernouy/cms-repository

HTTP surface for publishing CmsCore repository resources such as official
integration catalogues.

## Boundaries

- This package mounts read-only repository endpoints onto a provided `Runner`.
- This package consumes feature contracts and receives concrete repositories
  through its constructor.
- Do not import filesystem, database, or network adapters here. Runtimes decide
  whether a repository is backed by local resources, storage, or another API.

## Rules

- Repository endpoints must be read-only unless a write contract is explicitly
  introduced.
- Keep response shapes aligned with feature interfaces.
- Do not expose secret values or environment-specific configuration.
