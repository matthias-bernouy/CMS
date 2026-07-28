# @bernouy/cms-integration-registry

Write-side feature for the persistent CMS integration registry.

## Boundaries

- The root export owns immutable catalog snapshot, publication, recovery, and
  diagnostic contracts without selecting persistence adapters.
- Filesystem implementations live behind the explicit `./fs` subpath.
- This package depends only on published exports from integration feature
  packages. It must not import surfaces or runtimes.

## Rules

- A catalog candidate is fully validated before it can replace the live
  snapshot.
- Readers retain immutable snapshots while a replacement is built.
- Invalid integrations are isolated and reported without making partially
  validated content visible.
- Package reads resolve exact locations from the live snapshot and never scan
  the registry tree on the request path.
