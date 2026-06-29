# @bernouy/cms-content

Feature package for the content aggregate: pages, blocs, templates, snippets,
settings, editor contracts, validation, and read models.

## Boundaries

- Root export exposes entity types, `CmsRepository`, `ContentReader`, in-memory
  repository, validation, snippet expansion, constants, and style generation.
- `@bernouy/cms-content/editor` exposes browser/editor-safe authoring
  contracts.
- `@bernouy/cms-content/mongo` exposes `MongoCmsRepository` for composition
  roots.
- Do not import surfaces, runtimes, Control internals, or persistence adapters
  into `core/` or `interfaces/`.

## Rules

- Content validation belongs in `core/validation/` and should be enforced by
  `ValidatingCmsRepository`.
- Stored HTML/SVG must pass through the existing hardening/sanitizing helpers.
- Page/template/snippet references should use the existing content-ref helpers.
- Editor contracts must remain stable; authored blocs depend on them.
- When changing repository behavior, update both in-memory and Mongo behavior
  or document why only one implementation changes.
