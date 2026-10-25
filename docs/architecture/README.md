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

The Provider that implements `ulvia.cms.content` projects its writable
`CmsRepository` into the read-only `ContentReader` from
`@bernouy/cms-content/rendering`. The production Kernel reads that projection
through the selected Content delivery capabilities; it never receives the
writable repository. Kernel sees only published Pages/routes, projected
settings and renderable Bloc artifacts. The current `delivery.read` capability
wraps operation-specific JSON in strings; validation of those inner projections
is incomplete. Contract admission therefore does not yet establish every field
the Kernel consumes. See the [audit](../AUDIT.md).
File references are resolved through the selected `ulvia.cms.files` provider.
Sitemap storage is an independent dependency of the Content provider runtime.

Every page has a monotonic concurrency revision used by authoring and collection
migrations. This is not user-facing page history. Page publication is
`visible === true`. The editor has bounded in-memory undo/redo; durable
user-facing Page history is not implemented.
File visibility and temporary private
access are enforced by the selected Files provider.

Installed collection Blocs, themes, texts and Pages are projected
from immutable releases. Breaking stored-data upgrades use the maintenance-mode
workflow documented in [collections](../blocs/collections.md).
Container image upgrades are a separate operation: they replace executable
components, not installed collection releases. A previous-image fallback does
not reverse MongoDB writes. Internal persistence migrations and verified
backup/restore remain [open operational work](../TODO.md).

### Repository And Gateway

See [Instance MCP V1](instance-mcp.md) for delegated connections, collection
authoring and the HTTP-only Repository boundary.

`cms-repository` owns immutable contract releases and provider manifests,
site installation and selection models, revisioned storage, and authored
collection admission. It does not call providers.

`cms-gateway` owns `invocation` and `identity`. It resolves exact
selections, checks readiness and authorization, executes admitted transport
plans, validates results, and supplies provider aliases and streaming transport.
Files providers use generic transforms from `@bernouy/image-processing`.

The production runtime constructs Mongo catalogues and site stores, secret
resolution, network adapters, identity storage and observation refresh. The
Kernel receives provider-neutral invocation and a static Page capability analyzer.
It exposes collection-backed provider and collection administration Pages;
provider connection approval, credential rotation and exact contract selection
are application workflows owned by `cms-repository`. Repository publication is
served independently by `official-repository-server`. See
[repository and gateway flows](../providers/README.md).
The [community Repository](community-repository.md) adds cryptographic namespace
ownership and an admitted HTTP Repository capability contract. The reusable
MCP binding is mounted by the CMS instance.

### Authentication

`cms-auth` groups accounts, local credential proof, signed session tokens,
personal access tokens, one-time tokens, authentication email composition and
account-lifecycle operations. The Provider runtime exposes them through the
required `ulvia.cms.access` contract. Access delegates delivery to the selected
`ulvia.cms.emailer` implementation. The official `ulvia.cms.emailer.smtp`
specialization owns SMTP configuration and stores it inside its isolated
`ulvia.cms.secrets` namespace. The Kernel owns no
auth capabilities or auth persistence: it resolves one request actor through
Access and applies validated semantic session effects.

Mongo and SMTP adapters are explicit runtime imports. The generic encrypted
value store remains Foundation infrastructure behind `cms-secrets`.

## Surface And Runtime Composition

The Kernel mounts every site or contributed Page and feature-owned HTTP handlers
on one supplied `Runner`.
SEO metadata, structured data, dynamic indexing and sitemap materialization are
owned by `cms-content`. The selected Content implementation produces robots and
sitemap resources through declared delivery capabilities; Kernel only mounts
the injected resource handlers on its public URLs.
Whether a Page is public, authenticated or administrative is derived by
statically analyzing its capability requirements; there is no Page surface field or separate
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
manages the persistent local container stack; it does not supervise application processes.
`official-repository-server` mounts the public immutable
repository and its signed publication protocol over one persistent production
volume; authored official releases remain separate publication inputs. New
environment reads belong in runtimes; a fixed
set of existing `process.env.MODE` reads elsewhere is recorded in the
[architecture policy](../../quality/architecture/repository/repositoryPolicy.ts).

See [development](../development/README.md),
[Kernel routing](../surfaces/kernel.md) and
[responsive images](../images/README.md).
