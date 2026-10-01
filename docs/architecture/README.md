# Workspace Architecture

CmsCore is a Bun and TypeScript workspace. The root `package.json` declares
five package layers, with dependencies permitted toward lower layers:

```text
runtimes -> surfaces -> resources -> features -> foundation
```

| Layer | Responsibility |
| --- | --- |
| `foundation/` | Generic building blocks without CMS-domain knowledge. |
| `features/` | CMS contracts, validation, domain behavior and optional adapters or handlers. |
| `resources/` | Declarative, versioned CMS resources, including the collection text example. |
| `surfaces/` | HTTP applications assembled from injected feature dependencies. |
| `runtimes/` | Executable composition roots that choose adapters, read configuration and start listeners. |

A package can skip intermediate layers. Feature-to-feature imports use declared
package exports. See the [package map](packages.md) and [import rules](imports.md).

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
`editor`, `application` and `exports`. Its `CmsRepository` is the content
persistence facade; it is distinct from the `@bernouy/cms-repository` package.

Control receives a writable `CmsRepository` and authoring file dependencies.
Delivery receives a fresh `ContentReader` from `@bernouy/cms-content/rendering`:
published pages/routes, projected settings and renderable Bloc artifacts.
`@bernouy/cms-content/files/serving` exposes original reads, writable variants
and separate sitemap storage. Runtimes construct these facades and adapters.

Page publication is `visible === true`; separate publication revisions are not
implemented. Editorial preview belongs to Control. Author files are publicly
readable by ID/path, including files used only by drafts or no page at all.
The shared runtime does not provide confidential author-file enforcement.

The current Bloc compiler and editor consume stored compiled artifacts. The
repository's new collection format has admission and structure validation, but
no renderer/publication/installation bridge to those artifacts yet. See
[collections](../blocs/collections.md).

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
local development stack. New environment reads belong in runtimes; a fixed
set of existing `process.env.MODE` reads elsewhere is recorded in the
[architecture policy](../../quality/architecture/repository/repositoryPolicy.ts).

See [development](../development/README.md),
[Control API routing](../surfaces/control-api.md),
[Control static routing](../surfaces/control-static.md) and
[responsive images](../images/README.md).
