# @bernouy/cms-files

Official provider implementation for file namespaces, scoped credentials,
streaming uploads, immutable generations, signed private reads, and image
representations.

## Public API

- `@bernouy/cms-files` exposes `CmsFilesService`, domain contracts, errors, and
  image derivative scheduling.
- `/feature` exposes `filesFeature`, its complete contract metadata/default execution,
  and the structural `FilesService` / `CmsFileWorkspace` ports.
- `/memory` provides the in-memory metadata store.
- `/mongo` provides the Mongo metadata adapter for composition roots.

Namespace keys are the authority boundary. Stored verifiers and signing keys
must never leave the implementation, and public generation URLs remain
immutable. Byte transport preserves streams and backpressure.

See the [workspace package map](../../../docs/architecture/packages.md). Licensed
under the repository [MIT License](../../../LICENSE).

## Feature sources

`src/feature.ts` owns the version and the explicit 27-capability inventory.
`src/schemas/` contains reusable Zod models; public namespace and file reference
business types derive from these models. Persistence records remain internal storage
contracts. Capability descriptors in `src/capabilities/` declare HTTP/MCP bindings,
errors and `execute` functions. Ordinary `docs/**/*.md` files are discovered only
by the SDK build. Schema/capability construction files have no public subpaths.

The Provider selects the whole feature and injects its service and managed workspace.
The latter retains namespace credentials behind its port. Features do not select
production stores or read environment configuration. Reads return streamed responses;
uploads consume a borrowed binary stream. Range, If-Range, disposition and cache
headers remain part of the byte response. Domain credentials are checked per call;
none of these capabilities uses keyed execution receipts.
