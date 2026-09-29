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
- `@bernouy/image-processing`: generic image inspection and WebP byte transforms;
  the optional `./sharp` adapter is shared by author files and gateway media.
- `@bernouy/components`: public custom elements (`<p9r-*>`, `<w13c-*>`) and
  the CMS data-binding runtime.

Resources:

- `packages/resources/sites`: retained declarative CMS site references built
  from pages, themes, bindings, and Blocs. New sites are initialized
  through the CMS onboarding flow rather than copied from repository templates.

Feature packages:

- `@bernouy/cms-content`: pages, blocs, settings, validation, editor contracts,
  repository contracts, and the CMS-owned author file library. File metadata,
  blob stores, lifecycle, local/S3 adapters, image variants, URL helpers, and
  serving handlers live under its explicit `./files` subpaths.
- `@bernouy/cms-repository`: the shared package for contracts and providers,
  with an initial authored collections domain. `./contracts` owns immutable releases,
  `ulvia-schema/v1`, digests, HTTP binding compilation, compatibility and the
  release catalogue. `./providers` owns manifest admission, pure installation,
  connection and runtime-report models and validators. Explicit subpaths add
  manifest publication/comparison, local installation lifecycle, full-site graph
  planning and revisioned memory stores.
  Immutable artifacts and site installation state remain distinct. The root
  exports types only; Mongo release publication uses `./contracts/mongo` and
  manifest, installation and selection state use `./providers/mongo`. Live
  connection belongs to `cms-gateway`. `./collections` adds authored bundles, asset checks
  and Light DOM/component structure, not renderer compilation or installation.
- `@bernouy/cms-gateway`: capability invocation boundary. It resolves
  pinned selected releases and ready installations, executes admitted synchronous
  JSON query and bounded file bindings through an injected transport, validates
  outputs, and exposes provider-scoped identity and image derivatives. `./handlers`
  provides optional Control and Delivery call envelopes; `./http` and `./node-http`
  provide transport and pinned network adapters, while `./mongo` persists identity
  aliases. The production runtime supplies
  trusted actors, conservative grants, catalogue
  revision checks and secret resolution when `CMS_GATEWAY_SITE_ID` is configured.
  Dynamic page indexing invokes selected gateway queries and projects declared
  response fields for metadata and sitemap discovery.
- `@bernouy/cms-secrets`: secret storage contracts, `${VAR}` resolution, and
  encrypted Mongo storage.
- `@bernouy/cms-auth`: accounts, local/OIDC providers, PATs, signed sessions,
  email and public-auth action composition. Auth HTTP registrars use `./http`,
  admin mutations use `./management`, and Mongo/SMTP adapters use `./mongo`
  and `./smtp` from composition roots.
- `@bernouy/cms-analytics`: privacy-first server-side analytics events,
  counters, stores, and dashboard handlers.
- `@bernouy/cms-bloc-compile`: bloc validation, view/editor bundling, and the
  editor externals plugin.
- `@bernouy/cms-editor-system-v2`: editor shell components and editor runtime
  types.

Surface packages:

- `@bernouy/cms-control`: admin UI, REST API, authenticated static pages, media
  admin, settings, users, selected gateway capabilities, and editor endpoints.
- `@bernouy/cms-delivery`: public rendering, page lookup, bloc bundles,
  component runtime, gateway capability routes, media serving, sitemap, robots, and
  analytics collection.
Runtime packages:

- `@bernouy/ulvia-cli`: local CMS development launcher backed by MongoDB.
- `@bernouy/cms-server`: production composition root. It reads environment,
  wires Mongo/local filesystem/crypto/auth/gateway/analytics, and starts
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

`cms-content` groups these layers inside sibling domains:

```text
cms-content/src/
|-- pages/        publication, routes, SEO, page validation and snapshots
|-- blocs/        catalogue, composition, usage and publication
|-- files/        author library, original storage, serving and derivatives
|-- settings/     site configuration and public rendering projection
|-- theme/        token catalogues, modes, values and generated CSS
|-- editor/       authoring contracts, bindings, document and markup helpers
|-- application/  cross-domain contracts, facades and aggregate persistence
`-- exports/      curated package entrypoints, including files/*
```

Control receives `CmsRepository` and authoring file stores. Delivery receives a
fresh `ContentReader` facade from `/rendering`: published pages/routes, projected
rendering settings and renderable bloc artifacts. Its `/files/serving` dependencies
expose get-only originals, writable variants and a separate sitemap store.
Runtimes construct the facades and import `/mongo`, `/files/local-fs`, `/files/mongo`
or `/files/s3` adapters. `/editor`, `/theme`, `/page-path` and `/files/urls` remain
browser-safe. Import checks enforce Delivery's public entrypoints.

Publication is still `visible === true`, without separate page revisions.
Authenticated editorial preview remains in Control. Author files are independently
public by ID/path, including draft-only and unreferenced files. The shared-process
runtime does not claim operational isolation or confidential-media enforcement.

`cms-auth` uses the same domain-first approach: `accounts`, `providers`,
`sessions`, `tokens`, `email`, and `application`, plus `exports`. The application
coordinates login, account lifecycle, public recovery flows and HTTP handling.
Runtimes build a fresh `PublicAuthActions` object from user, credential, token
and email dependencies; public HTTP consumers receive operations, not those
stores. Control retains its administrative stores, and its test-email action
is supplied separately from Delivery's public operations.
The `/http` entrypoint contains mountable handlers, not a production transport;
`/mongo` and `/smtp` remain runtime-only adapters. `/browser` stays browser-safe.

`cms-repository` groups contract logic under `src/contracts/` and provider logic
under `src/providers/`, with public barrels under `src/exports/contracts/` and
`src/exports/providers/`. Tests and fixtures use the same domain separation.
Consumers use `@bernouy/cms-repository/contracts` and its `/schema`, `/bindings`,
`/compatibility`, `/catalogue`, `/mongo` and `/protocol` subpaths, or
`@bernouy/cms-repository/providers` and its `/catalogue`, `/compatibility`,
`/installations` and `/selections`
subpaths. The initial `./collections` entrypoint parses and admits authored
component/composition bundles; themes, i18n, imports, views, dashboards and
collection installation remain future slices. See the [package guide](../packages/features/cms-repository/README.md).

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
