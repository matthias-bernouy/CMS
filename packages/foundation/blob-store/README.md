# @bernouy/blob-store

CMS-agnostic, stream-first storage for opaque blobs.

## Public API

- `@bernouy/blob-store` exposes the storage contract.
- `/memory` is intended for tests and single-process development.
- `/local-fs` stores blobs on a local filesystem.
- `/s3` targets S3-compatible object storage.

Callers own media meaning, authorization, metadata, and lifecycle policy. The
adapters preserve streaming reads and writes rather than buffering by default.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
