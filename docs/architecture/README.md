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
`official-provider` contains the official provider domain, adapters and server
entrypoint. `official-repository` contains its versioned catalogue of official
contracts, provider manifests and collections; it is authored publication data,
not an executable dependency layer.

The official provider may consume Foundation and public provider-protocol
facades. CMS features and surfaces do not depend on its implementation; only
the local CLI composes its declared server entrypoint for development.

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

`cms-content/src/` groups `pages`, `blocs`, `files`, `settings`, `theme`,
`application` and `exports`. Its `CmsRepository` is the content
persistence facade; it is distinct from the `@bernouy/cms-repository` package.

Control receives a writable `CmsRepository` and authoring file dependencies.
Delivery receives a fresh `ContentReader` from `@bernouy/cms-content/rendering`:
published pages/routes, projected settings and renderable Bloc artifacts.
`@bernouy/cms-content/files/serving` exposes original reads, writable variants
and separate sitemap storage. Runtimes construct these facades and adapters.

Every page has a monotonic concurrency revision used by authoring and collection
migrations. This is not user-facing page history. Page publication is
`visible === true`; separate publication versions are not implemented.
Editorial preview belongs to Control. Author files are publicly
readable by ID/path, including files used only by drafts or no page at all.
The shared runtime does not provide confidential author-file enforcement.

Installed collection Blocs, themes, texts and transitional views are projected
from immutable releases. Breaking stored-data upgrades use the maintenance-mode
workflow documented in [collections](../blocs/collections.md).

### Repository And Gateway

`cms-repository` owns immutable contract releases and provider manifests,
site installation and selection models, revisioned storage, and authored
collection admission. It does not call providers.

`cms-gateway` owns `invocation`, `identity` and `media`. It resolves exact
selections, checks readiness and authorization, executes admitted transport
plans, validates results, and supplies provider aliases and image derivatives.
Generic image transforms live in `@bernouy/image-processing`.

The production runtime constructs Mongo catalogues and site stores, secret
resolution, network adapters, identity storage and observation refresh. Surfaces
receive invocation, access checks, selected catalogue reads and image handling.
Publication, approval and selection administration are not mounted as product
flows. See [repository and gateway flows](../providers/README.md).

### Authentication

`cms-auth` groups accounts, providers, sessions, tokens, email and application
composition. Runtimes build `PublicAuthActions` from credential, user, token
and email dependencies. Delivery receives those operations; Control retains
administrative stores. Auth UI components remain in the surface.

HTTP handlers use `@bernouy/cms-auth/http`; Mongo and SMTP adapters are explicit
runtime imports. `@bernouy/cms-auth/browser` stays browser-safe. Secret storage
is generic infrastructure in `@bernouy/secret-store` under Foundation.

## Surface And Runtime Composition

Control mounts its admin UI, file-routed API and editor on a supplied `Runner`.
Delivery mounts public rendering, authentication, files, gateway routes,
sitemaps and robots on its supplied runner. Neither surface chooses
production databases or storage roots.

`cms-server` reads environment configuration, wires concrete dependencies,
mounts both surfaces and starts listeners. `ulvia-cli` manages the persistent
local development stack. `official-repository-server` mounts the public immutable
repository and its signed publication protocol over one persistent production
volume; authored official releases remain separate publication inputs. New
environment reads belong in runtimes; a fixed
set of existing `process.env.MODE` reads elsewhere is recorded in the
[architecture policy](../../quality/architecture/repository/repositoryPolicy.ts).

See [development](../development/README.md),
[Control API routing](../surfaces/control-api.md),
[Control kernel routing](../surfaces/control-kernel.md) and
[responsive images](../images/README.md).
