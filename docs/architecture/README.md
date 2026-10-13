# Workspace Architecture

CmsCore is a Bun and TypeScript workspace. The root `package.json` declares
four reusable CMS package layers, with dependencies permitted toward lower layers:

```text
runtimes -> surfaces -> features -> foundation
```

| Layer | Responsibility |
| --- | --- |
| `foundation/` | Generic building blocks without CMS-domain knowledge. |
| `features/` | CMS contracts, validation, domain behavior and optional adapters or handlers. |
| `surfaces/` | HTTP applications assembled from injected feature dependencies. |
| `runtimes/` | Executable composition roots that choose adapters, read configuration and start listeners. |

A package can skip intermediate layers. Feature-to-feature imports use declared
package exports. See the [package map](packages.md) and [import rules](imports.md).

Products that are not CMS layers can live directly below `packages/`.
`official-repository` contains the versioned catalogue of official contracts,
provider manifests and collections; it is authored publication data, not an
executable dependency layer. The `ulvia-provider` surface exposes admitted official
CMS contracts through the same provider protocol used by every other provider.

## Domain Organization

Features may group `interfaces/`, `core/`, `default-implementation/` and `http/`
under a domain. `exports/` supplies public package entry points. Use a folder
only when its responsibility exists; these are conventions, not a scaffold that
every package must reproduce.

- `interfaces/` describes contracts and types; executable behavior belongs in
  domain logic, implementations or handlers.
- `core/` consumes dependencies through interfaces.
- `default-implementation/` contains concrete implementations.
- `http/` provides mountable handlers or registrars without choosing production
  persistence or network adapters.
- `exports/` corresponds to the subpaths declared in `package.json`.

### Content And Authoring

`cms-content/src/` groups `pages`, `blocs`, `settings`, `theme`,
`application` and `exports`. Its `CmsRepository` is the content
persistence facade; it is distinct from the `@bernouy/cms-repository` package.

The runtime projects the writable `CmsRepository` into the read-only
`ContentReader` from `@bernouy/cms-content/rendering` before constructing
Kernel. Kernel sees only published Pages/routes, projected settings and
renderable Bloc artifacts.
File references are resolved through the selected `ulvia.cms.files` provider.
Sitemap storage is an independent runtime dependency.

Every page has a monotonic concurrency revision used by authoring and collection
migrations. This is not user-facing page history. Page publication is
`visible === true`; user-facing Page history is not implemented.
File visibility and temporary private
access are enforced by the selected Files provider.

Installed collection Blocs, themes, texts and Pages are projected
from immutable releases. Breaking stored-data upgrades use the maintenance-mode
workflow documented in [collections](../blocs/collections.md).

### Repository And Gateway

`cms-repository` owns immutable contract releases and provider manifests,
site installation and selection models, revisioned storage, and authored
collection admission. It does not call providers.

`cms-gateway` owns `invocation` and `identity`. It resolves exact
selections, checks readiness and authorization, executes admitted transport
plans, validates results, and supplies provider aliases and streaming transport.
Files providers use generic transforms from `@bernouy/image-processing`.

The production runtime constructs Mongo catalogues and site stores, secret
resolution, network adapters, identity storage and observation refresh. The
Kernel receives provider-neutral invocation and a Page execution service.
It exposes collection-backed provider and collection administration Pages;
provider connection approval, credential rotation and exact contract selection
are application workflows owned by `cms-repository`. Repository publication is
served independently by `official-repository-server`. See
[repository and gateway flows](../providers/README.md).

### Authentication

`cms-auth` groups accounts, providers, sessions, tokens, email and application
composition. Runtimes build `PublicAuthActions` from credential, user, token
and email dependencies. The Kernel receives the public operations and injected
authentication ports. Its small sign-in document is HTTP presentation only.

HTTP handlers use `@bernouy/cms-auth/http`; Mongo and SMTP adapters are explicit
runtime imports. `@bernouy/cms-auth/browser` stays browser-safe. Secret storage
is generic infrastructure in `@bernouy/secret-store` under Foundation.

## Surface And Runtime Composition

The Kernel mounts every site or contributed Page, authentication and
feature-owned HTTP handlers on one supplied `Runner`.
SEO metadata, structured data, dynamic indexing and sitemap materialization are
implemented by `cms-seo`; Kernel mounts its robots and sitemap handlers while
the runtime starts periodic materialization.
Whether a Page is public, authenticated or administrative is derived from the
capabilities in its execution plan; there is no Page surface field or separate
admin/public route namespace. Ulvia Provider mounts the provider report and the
declared HTTP bindings of `ulvia.cms.*`. Neither surface chooses production
databases or storage roots.

The Ulvia Provider surface also owns the thin cross-domain adapters that register the
official capabilities, project their wire responses and map feature failures.
Actual page, file, collection, migration, authentication, provider and theme
operations remain in their feature packages. `ulvia-provider-server` injects
those ports. Each server composition root owns only its concrete adapters;
there is no aggregate instance-runtime package shared by both processes.

`cms-kernel-server` and `ulvia-provider-server` each read their own environment,
mount exactly one surface and start one listener. The Kernel runtime is
stateless; the Provider runtime selects every persistent adapter. `ulvia-cli`
manages the persistent local development stack and supervises both processes.
`official-repository-server` mounts the public immutable
repository and its signed publication protocol over one persistent production
volume; authored official releases remain separate publication inputs. New
environment reads belong in runtimes; a fixed
set of existing `process.env.MODE` reads elsewhere is recorded in the
[architecture policy](../../quality/architecture/repository/repositoryPolicy.ts).

See [development](../development/README.md),
[Kernel routing](../surfaces/kernel.md) and
[responsive images](../images/README.md).
