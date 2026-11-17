# Ulvia CLI

Ulvia installation and release CLI. The shared-hosting implementation requires
compatible Provider and Edge images labelled `io.ulvia.hosting-api=1`.

For the operator journey, follow the
[installation guide](../../../docs/installation/README.md). Architecture,
verification and deployment limits are documented in
[shared hosting](../../../docs/architecture/shared-hosting.md).

The workspace package is private source. Official distribution bundles workspace
dependencies into `@cyaxis/ulvia`; it does not publish this workspace package.
Workspace TypeScript declarations are emitted to `dist/types/`, separately from
the generated system snapshot in `dist/bootstrap/`. Regenerating that snapshot
must not remove compiler outputs or make incremental and clean builds differ.
Build one exact CLI release and its compatible default stack version with:

```bash
bun run build --version VERSION
```

Use the same exact distribution version for the CLI, Provider and Edge. This creates a checked
npm archive and one SHA-256 receipt below `artifacts/distributions/VERSION/cli/`. Publishing is a separate
explicit `bun run publish --version VERSION` operation. The versioned build seals
the CLI, images and official releases under `artifacts/distributions/VERSION/`;
publication selects that snapshot and verifies its bytes before any upload.

## Shared infrastructure

From workspace source, supply an exact initial image version:

```bash
bun run ulvia -- configure --domain control.localhost --edges 1
bun run ulvia -- apply --version STACK_VERSION
bun run ulvia -- status
bun run ulvia -- logs --filter component=provider
bun run ulvia -- logs --filter service=edge-1 --follow
bun run ulvia -- stop
bun run ulvia -- start
```

The CLI starts one Compose project with MongoDB, Provider, Caddy and a configured
pool of shared Edge processes. The Provider automatically creates empty Control.
The default public URL is `http://control.localhost:5100/.cms/setup`. Initial
administrator credentials are in the private file announced at startup, never
printed. Control uses native setup and can explicitly remain without collections
or Pages. Create other logical sites through its admitted `ulvia/cms.hosting`
HTTP/MCP capabilities; no CLI instance lifecycle commands remain.

`configure --edges 2` followed by `apply` scales the pool. Site creation
does not create containers. Reducing the configured count removes obsolete shared
Edge containers. Stopping infrastructure makes all its logical sites unavailable
while retaining their persistent data.

Persistent data lives below `$XDG_DATA_HOME/ulvia` or
`~/.local/share/ulvia`. `ULVIA_DATA_DIR` provides explicit installation isolation.
`services/installation.json` holds mandatory hosting and network configuration;
`services/stack.json` separates the last applied deployment from a resumable operation;
`services/deployments/<id>/` retains its exact private Compose/configuration snapshot;
`services/runtime.json` holds private infrastructure keys. MongoDB and CMS file
storage belong to the shared services. There is no per-site Edge runtime state.
The local release cache remains in `<data>/repository`.

The CLI reuses validated cached exact-version images and pulls missing ones.
It checks component, stack API, hosting API, version and repository digest. A
mismatched cached image refuses startup. Source builds require `--version` on
first apply; bundled releases carry an exact default. `start` only starts existing
containers using the applied snapshot. Explicit stack upgrades use:

```bash
ulvia upgrade --version STACK_VERSION
```

Provider replacement checks retained execution support first. Failed activation
retains a resumable target while the applied release stays unchanged. `status`
shows observed container/image state. Resume with `upgrade`; no data rollback occurs.
Contract and collection upgrades remain explicit admitted operations.

## Domains and initial access

Configure public listeners before first launch:

```bash
ulvia configure --bind 0.0.0.0 --http-port 80 --tls acme --https-port 443 --acme-email ops@example.com
ulvia configure --domain control.example.com --public-addresses 203.0.113.10
ulvia apply
```

Use the installation's real domain and addresses. Network settings and Control's
origin lock after the first launch. Hosting settings can change the shared Edge
count, operator-managed suffixes and public-address allowlist; apply them with
`apply`. Customer domain claims use Control's contracts and ownership validation.
Caddy uses the admitted TLS permission binding and persistent certificate storage.
DNS/TLS pending state is distinct from a provisioned instance and healthy backend.
The Provider operator listener remains on loopback.

Native setup offers a custom Repository, the official Repository, or creating a
Registry on that instance. Registry activation is explicit, through its exact
installed selection; it has no separate image, container, profile or service.
All sites begin without collections. Completing an empty site leaves `/` at 404.

Infrastructure mutations share a native process lock at the installation root.
Missing mandatory configuration or keys over existing state fail without repair;
startup never replaces an existing Control administrator. `reset --yes` deletes
Ulvia-owned installation data and the local release cache. Keep a complete matching
backup of database, files and credentials before destructive recovery.

## Repository account connections and releases

`repository login URL` prompts for a CMS PAT with terminal input hidden when
`ULVIA_REPOSITORY_TOKEN` is absent. Automation can use `--token-stdin` or
`ULVIA_REPOSITORY_TOKEN`. The saved PAT is pinned to the origin and Repository
identity. Ordinary Repository accounts can claim namespaces and publish. Logout removes the local
connection without revoking the remote token. Client configuration uses
`$XDG_CONFIG_HOME/ulvia`, `~/.config/ulvia` or explicit `ULVIA_CONFIG_DIR`;
`ULVIA_DATA_DIR` alone isolates it under `<data>/config`. Files are private.

```bash
ulvia repository login https://repository.example.com
ulvia namespace claim example
ulvia release /path/to/resources --recursive
ulvia push all
ulvia repository logout
```

Client connections and authored release caches are independent of site Repository
settings. Publication never installs resources into a site automatically.

`release <resource-directory>` accepts a trusted local `ulvia.release.ts` entry
or reads `definition.json` and routes by `kind`:
`collection`, `contract`, or `provider-manifest`. It validates and stores one
immutable release. A provider manifest must reference exact contract releases
already in the local repository. Release does not connect to or test a provider.
`release <directory> --recursive` discovers authored resource roots below a
folder, stopping before nested Bloc definitions. It orders contracts by
inheritance, then prepares Provider manifests and collection dependencies.
Existing local dependencies are reused. Source admission happens
before any resource is stored; each resource is committed separately, so a
storage or publication conflict can leave a partial batch. Retrying identical
releases is idempotent. Duplicate coordinates and symbolic links are rejected.
Discovery is bounded to 256 resources, 4096 directories and 32 directory levels;
prepared canonical bytes and assets are bounded to 512 MiB. `push` remains an
explicit separate command.

```bash
# Official distribution, without changing the personal release cache:
bun run build --version VERSION
bun run publish --version VERSION
# Generic manual preparation still writes to the personal release cache:
ulvia release infra/releases
```

The official build and the trusted local `ulvia.release.ts` entry share the same
SDK inventory and compiler for feature contracts, manifest claims and bootstrap. See the
[SDK workflow](../../../docs/development/sdk-releases.md) for explicit versions,
source-module rules and generated runtime attachment.

Contract fixture assets declared in `definition.json` are read from
`fixtures/<asset-id>` and verified by digest. Releasing the same coordinate with
different content fails. Local release storage is a private CLI cache, not an
HTTP server. `push` publishes it to the configured CMS Repository; its public
catalogue and downloads use admitted `ulvia/repository` bindings under
`/.cms/call/ulvia/repository`. CMS installation and Provider administration
consume those public sources. `prune` empties the local cache without deleting
service or instance data.

Contract authors may keep only release metadata in `definition.json` and split
capabilities recursively below `capabilities/`. Each capability is one JSON
object. Optional `mocks/**/*.json` fragments contain one mock plus its explicit
`capabilityId`; mocks embedded in capability fragments reject. The compiler
sorts capabilities and mocks by their declared IDs, so paths never affect the
immutable digest. `definition.json` cannot contain an inline `capabilities`
array in this JSON source format. SDK features instead use `defineFeature` and
explicit capabilities/mocks, producing the same admitted release format.

`push <publisher/id@version>` infers the kind from local cached releases. If the
same coordinate exists in several catalogues, specify `push contract`,
`push collection` or `push provider` to resolve the ambiguity. `pull` still takes
an explicit kind and downloads and re-admits one exact coordinate locally.

`push all` publishes every non-yanked release in the local cache, independently
of the working directory. It orders contract inheritance,
then providers and known local collection dependencies. All artifacts and every
namespace's account ownership are checked before the first upload. No namespace
is implicitly claimed and releases without usable account credentials are not silently skipped.
A remote refusal or transfer failure stops the batch; already completed
publications remain visible. Repeating the command reconciles identical releases
and resumes the remainder. The receiving Repository still validates dependency
availability and every immutable artifact. For single pushes, transfer required
dependencies first.

```bash
ulvia push ulvia/cms.emailer@1.0.0
ulvia push all
```

`repository login` saves the default endpoint; `--repository` and
`ULVIA_REPOSITORY_URL` remain explicit overrides. Every protected request uses
the origin/identity-bound PAT. Uploads bind the account, namespace and ownership
revision; transfer or revocation prevents unauthorized continuation. Publication
re-runs admission and evolution rules, streams bounded assets, verifies byte
lengths and SHA-256 digests, and makes the artifact visible last. Exact retries
are idempotent; different bytes at an existing coordinate reject.

The protocol and exact-coordinate client live in
`@bernouy/repository/repository/publication`. The CLI and CMS authoring
implementation share those clients. The official Provider composes the domain
service and persistence for explicitly enabled Repository instances; Edge
exposes the selected admitted contract. The Repository uses ordinary CMS capabilities and account PATs.

`yank` is reversible catalogue metadata: it hides a release from new catalogue
resolution without deleting its exact historical bytes. `restore` exposes it
again. Contract yanks block new dependent publications while previously
published provider manifests remain readable.

A collection keeps immutable administration copy in recursive locale
directories such as `translations/en/collection.json` and
`translations/en/theme/colors.json`. Every JSON object below
`translations/<locale>/` contributes to that locale's flat catalogue.
Collection, Bloc, setting, text, theme and example metadata stores
reusable keys from those catalogues rather than inline labels. A key may occur
in only one fragment per locale. The collection locale must define every
referenced key; additional locale directories may be partial and fall back to
it.

A collection theme is authored as an ordered set of files. Its
`theme/definition.json` contains the theme label key and the ordered list of
category IDs. Category files may be organized recursively below `theme/`; the
scanner finds them by their internal `id`, while the manifest remains the only
source of display order. A category filename must match its ID, duplicate IDs
and orphan files reject, and category/token metadata uses the shared translation
keys. Categories use an `entries` array containing ordinary tokens and optional
typed `font-face` entries backed by local WOFF2 assets.

Collection assets are discovered recursively below `assets/`; their lowercase
relative paths are their stable IDs. They are not declared in the collection
`definition.json`. An optional root `assets/definition.json` accepts only a
`deprecations` object keyed by those paths. The compiler derives media type,
size and digest. Safe presentation-only SVG files receive the `inline-svg`
profile automatically; other SVGs remain downloadable assets but cannot be
expanded into authored Page DOM.

Collection texts use recursive `texts/definitions/**/*.json` arrays for stable
IDs and administration metadata, plus recursive
`texts/locales/<locale>/**/*.json` objects for content values. The release
command joins them into ordinary collection text records. Paths never prefix a
text ID; duplicate definitions, duplicate per-locale values and unknown value
IDs reject.

Bloc roots are discovered recursively below `blocs/`. A folder becomes a Bloc
when it contains `definition.json`, its basename must match the declared Bloc
ID, and discovery stops there so `settings/definition.json` is never mistaken
for a nested Bloc. Intermediate grouping directories contain only directories
and do not affect release identity.

The production Provider image bundles admitted system contracts, documentation
and the Provider manifest, without authored collections or starter assets. An
incomplete snapshot fails explicitly; bootstrap does not fall back to the network.
Restart preserves existing accounts, namespace ownership and edited Pages and
reopens ready instances from their persisted execution. Generate the API-only
snapshot from the SDK feature inventory with:

```bash
bun run build
```

That command neither publishes to a running repository nor upgrades an existing
instance. Collections are built and published only from explicitly supplied
sources; no starter collection is included in this command.
For individual manual releases, use `release` in dependency order:
exact parent contracts before specializations, then Provider manifests and collection dependencies.
Publication, system installation transitions, collection upgrades and container
image replacement remain separate actions.

Official releases evolve independently. Each feature owns its contract version;
the Provider manifest owns its version, and local state formats remain `v1`. This is source metadata, not evidence that a matching image
has been published. Collections are supplied and versioned by their authors.

## Collection examples

`ulvia preview <collection-directory> --output <new-directory> [--dependency <directory>] [--locale <locale>] [--theme-mode <light|dark>] [--no-screenshots] [--serve]`
exports collection example frames, generated PNGs, an interactive local explorer and a
provenance manifest. Screenshots require the Playwright Chromium browser
(`bunx playwright@1.64.1 install chromium`). Dependencies and required contracts are
resolved explicitly from local sources/cache; preview never publishes. See
[collection examples](../../../docs/blocs/examples.md) for source and release formats.

### Editable collection publication

Collection `release` captures a bounded immutable source snapshot before building
it in the local Repository cache. It retains sources alongside the admitted
release before making it visible locally. This uses the same source build engine
as the remote Repository and works offline with the local contract catalogue;
it starts no additional Repository server.

Collection `push` uploads the retained source snapshot and its exact binary
assets, then follows the remote Repository's durable build operation. Editing the
working directory after `release` does not alter the pushed version. The server
must reproduce the reviewed release digest before publication; a compiler or
contract-catalogue difference refuses publication rather than silently changing
the release. Collection release modules must also supply `sourceJson`.

Pulled or older compiled-only cache entries remain readable, but can only be
replayed to a Repository already containing that exact release. Publishing one
to a new Repository requires its original editable sources and an explicit
release. No source reconstruction runs. Contract and Provider manifest flows
are unchanged.
