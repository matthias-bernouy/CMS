# @bernouy/cms-repository

HTTP surface for publishing CmsCore repository resources such as official
integration catalogues.

## Boundaries

- This package mounts read-only repository endpoints onto a provided `Runner`.
- The explicit `./catalog` subpath exposes repository catalog routes, public API
  contracts, and the typed editor data-source descriptor. Public UI pages live
  in `packages/resources/sites/`, not in this surface.
- This package consumes feature contracts and receives concrete repositories
  through its constructor.
- Do not import filesystem, database, or network adapters here. Runtimes decide
  whether a repository is backed by local resources, storage, or another API.
- Do not import mutable-registry internals into catalog projection code. Map the
  public compatibility DTO at the injected reader boundary.
- The optional public compatibility route receives a structural reader and
  projects an explicit allowlist. Never expose report actors, filesystem paths,
  evidence-source locations, or unknown upstream fields.

## Rules

- Repository endpoints must be read-only unless a write contract is explicitly
  introduced.
- Keep response shapes aligned with feature interfaces.
- Do not expose secret values or environment-specific configuration.
