# @bernouy/cms-files

Feature package for CMS media files: metadata, blob storage, upload/update/delete
lifecycle, image variants, file URLs, and serving handlers.

## Boundaries

- Root export exposes contracts, memory/local filesystem implementations,
  validation, lifecycle helpers, image variant helpers, URL helpers, and HTTP
  serving handlers.
- `@bernouy/cms-files/mongo` exposes metadata persistence.
- `@bernouy/cms-files/s3` exposes S3 blob storage.
- `@bernouy/cms-files/urls` exposes URL helpers for consumers that do not need
  the full root export.

## Rules

- Metadata and blob mutations must stay consistent. Upload/update/delete flows
  should handle rollback where possible.
- Preserve `/.cms/files` and image variant URL semantics; Delivery and Control
  both rely on them.
- Generated image variants are cacheable and regenerable. Originals are not.
- Validate names, sizes, and tree operations through existing core helpers.
- Adapter changes need tests for missing blobs, duplicate names, folder trees,
  and versioned URLs.
