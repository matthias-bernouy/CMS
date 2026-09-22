# @bernouy/cms-content

Feature package for CMS-owned content: pages, blocs, settings, the author file
library, editor contracts, validation, and read models.

## Boundaries

- Root export exposes entity types, `CmsRepository`, `ContentReader`, in-memory
  repository, validation, constants, and style generation.
- `@bernouy/cms-content/editor` exposes browser/editor-safe authoring
  contracts.
- `@bernouy/cms-content/theme` exposes browser-safe theme value resolution.
- `@bernouy/cms-content/mongo` exposes `MongoCmsRepository` for composition
  roots.
- `@bernouy/cms-content/files` exposes the CMS-owned file metadata/blob
  contracts, lifecycle, local and in-memory implementations, image variants,
  URL helpers, and serving handlers.
- `@bernouy/cms-content/files/urls` is the browser-safe file URL surface.
- `@bernouy/cms-content/files/mongo` and `./files/s3` expose composition-root
  adapters.
- Provider-owned files and collection-release assets do not belong to the CMS
  author file tree.
- Do not import surfaces, runtimes, Control internals, or persistence adapters
  into `core/` or `interfaces/`.

## Rules

- Content validation belongs in `core/validation/` and should be enforced by
  `ValidatingCmsRepository`.
- Stored HTML/SVG must pass through the existing hardening/sanitizing helpers.
- Page bloc references should use the existing content-ref helpers.
- Editor contracts must remain stable; authored blocs depend on them.
- When changing repository behavior, update both in-memory and Mongo behavior
  or document why only one implementation changes.
- File metadata and blob mutations must stay consistent. Upload/update/delete
  flows should roll back where possible.
- Preserve `/.cms/files`, image-variant URL semantics, and the local
  `.cms-files-registry.json` format unless a task explicitly changes their
  external contract.
- Generated variants are cacheable and reconstructible; original author files
  are not disposable.
- Validate file names, sizes, and tree operations through the file core helpers.
