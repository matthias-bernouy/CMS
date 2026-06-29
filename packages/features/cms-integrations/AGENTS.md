# @bernouy/cms-integrations

Feature package for declarative integration definitions and import execution.

## Boundaries

- Root export exposes integration contracts, the built-in declarative registry,
  DTO parsing, template resolution, and import execution.
- This package may depend on feature contracts such as `@bernouy/cms-sources`
  and `@bernouy/cms-secrets`.
- Surfaces inject host-owned operations such as bloc artifact imports. This
  package must not import `cms-control`, surfaces, or runtimes.

## Rules

- Secret values must never be returned in import responses.
- Source writes and secret writes must avoid orphaned secrets on failed imports.
- Keep UI metadata declarative and optional. The server registry is the source
  of truth for admin integration rendering.
