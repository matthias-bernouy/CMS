# Monorepo Structure

CmsCore is a Bun and TypeScript workspace. Packages live under `packages/` and
are split into five layers:

```text
packages/
|-- foundation/   generic building blocks with no CMS-domain knowledge
|-- features/     CMS domain modules, one package per business area
|-- resources/    versioned declarative CMS resources
|-- surfaces/     HTTP applications assembled from feature contracts
`-- runtimes/     executable composition roots
```

The dependency direction is strict:

```text
runtimes -> surfaces -> resources -> features -> foundation
```

A layer never imports a layer above it. A feature may import another feature,
but only through that feature's declared package export.

## Packages

Foundation packages:

- `@bernouy/http-runner`: `Runner`, `BunRunner`, HTTP helpers, cache,
  compression, CSP, and test server helpers.
- `@bernouy/envelope-crypto`: envelope encryption, KEK/DEK contracts, field
  encryption, and the Mongo DEK adapter.
- `@bernouy/rate-limiter`: fixed-window rate limiting with memory and Mongo
  implementations.
- `@bernouy/components`: public custom elements (`<p9r-*>`, `<w13c-*>`) and
  the CMS data-binding runtime.

Resource packages:

- `@bernouy/cms-official-integrations`: local repository of official,
  versioned CMS integration resources. It stores manifests, source contracts,
  connector assets, and deployment blueprints without executing installs. It may
  depend on feature contracts to express typed integration definitions.

Feature packages:

- `@bernouy/cms-content`: pages, blocs, templates, settings, validation,
  editor contracts, and repository contracts.
- `@bernouy/cms-files`: metadata and blob stores, media lifecycle, local/S3
  storage, image variants, and file-serving handlers.
- `@bernouy/cms-secrets`: secret storage contracts, `${VAR}` resolution, and
  encrypted Mongo storage.
- `@bernouy/cms-permissions`: role definitions, grants, permission catalogue,
  and role repository contracts.
- `@bernouy/cms-auth`: local auth, OIDC auth, PATs, signed cookies, public auth
  flows, user/provider repositories, and auth route registrars.
- `@bernouy/cms-sources`: data-source contracts, endpoint execution, system
  sources, and source proxy helpers.
- `@bernouy/cms-source-images`: bounded responsive Source image recipes,
  browser activation, derivative caches, and image transformers.
- `@bernouy/cms-integrations`: declarative integration definitions, install
  artifacts, instance state, and repository contracts.
- `@bernouy/cms-analytics`: privacy-first server-side analytics events,
  counters, stores, and dashboard handlers.
- `@bernouy/cms-bloc-compile`: bloc validation, view/editor bundling, and the
  editor externals plugin.
- `@bernouy/cms-editor-system-v2`: editor shell components and editor runtime
  types.

Surface packages:

- `@bernouy/cms-control`: admin UI, REST API, authenticated static pages, media
  admin, settings, users, sources admin, integrations admin, and editor
  endpoints.
- `@bernouy/cms-delivery`: public rendering, page lookup, bloc bundles,
  component runtime, source proxy, media serving, sitemap, robots, and
  analytics collection.
- `@bernouy/cms-repository`: HTTP surface for browsing repository-backed CMS
  resources such as official integration catalogues.

Runtime packages:

- `@bernouy/cms-cli`: `p9r` CLI for scaffolding, local development, push/pull,
  files reindexing, secrets, and bloc listing.
- `@bernouy/cms-server`: production composition root. It reads environment,
  wires Mongo/local filesystem/crypto/auth/sources/integrations/analytics, and starts
  Control and Delivery runners.

## Feature Anatomy

Most feature packages use this shape:

```text
src/
|-- interfaces/              contracts and public types
|-- core/                    pure domain logic and validation
|-- default-implementation/  in-memory, local, or adapter-backed implementations
|-- http/                    handlers or registrars that surfaces can mount
`-- exports/                 public package subpath barrels
```

Not every feature needs every folder. For example, `cms-bloc-compile` is a
compile-time utility with `core/` and `exports/`; `cms-secrets` has no HTTP
surface of its own.

Keep these boundaries:

- `interfaces/` stays inert: types and contracts only.
- `core/` receives dependencies by interface and does not instantiate concrete
  persistence adapters.
- `default-implementation/` owns concrete implementations.
- `http/` may expose handlers, constants, or registrars, but it should not make
  production infrastructure choices.
- `exports/` is the package boundary. Every file here must match a declared
  `package.json` export subpath.

## Surfaces And Runtimes

Surfaces mount behavior onto a provided `Runner`. They can own application
routes, static HTML, API file routing, and page shells. They should consume
feature contracts and helpers, not production adapters such as Mongo or S3.

Runtimes are the only packages expected to read `process.env`, connect to
databases, instantiate network adapters, choose storage roots, and call
`runner.start()`.

## Build

The workspace build is sequenced:

1. `packages/foundation/components` builds first because consumers use its
   generated `dist/` bundle and declarations.
2. `bunx tsc --build` emits project-reference declarations.
3. `packages/surfaces/cms-control` builds its browser admin bundle.

Use the root commands:

```bash
bun run build
bun run typecheck
bun test
```

## See Also

- [import-rules.md](./import-rules.md)
- [api-folder.md](./api-folder.md)
- [static-folder.md](./static-folder.md)
- [blocs/README.md](./blocs/README.md)
- [images/README.md](./images/README.md)
