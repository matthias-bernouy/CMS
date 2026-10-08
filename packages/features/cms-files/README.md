# @bernouy/cms-files

Official provider implementation for file namespaces, scoped credentials,
streaming uploads, immutable generations, signed private reads, and image
representations.

## Public API

- `@bernouy/cms-files` exposes `CmsFilesService`, domain contracts, errors, and
  image derivative scheduling.
- `/memory` provides the in-memory metadata store.
- `/mongo` provides the Mongo metadata adapter for composition roots.

Namespace keys are the authority boundary. Stored verifiers and signing keys
must never leave the implementation, and public generation URLs remain
immutable. Byte transport preserves streams and backpressure.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).
