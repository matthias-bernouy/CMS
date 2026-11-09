# Ulvia CLI

Ulvia installation and release CLI.

For the operator journey from a fresh Ubuntu host to a running local or public
site, follow the [canonical installation guide](../../../docs/installation/README.md).

The workspace package contains private source code. Official releases are
bundled without workspace dependencies and published publicly as
`@cyaxis/ulvia`:

```bash
bun add --global @cyaxis/ulvia@latest
ulvia --help
```

From the workspace, build and publish one exact release with:

```bash
bun run cli:build --version 0.0.3 --stack-version 0.0.1-beta
bun run cli:publish --version 0.0.3
```

The build creates a checked npm archive and SHA-256 receipt below
`artifacts/cli`. The CLI package version and its compatible initial Docker stack
version are independent and both are sealed into that receipt. Publishing
accepts only the exact pair, targets the public npm registry, and uses the
`next` tag for prereleases or `latest` for stable versions. It requires npm
credentials configured outside the repository.

```bash
bun run ulvia -- configure network
bun run ulvia -- services start --version 0.0.1-beta
bun run ulvia -- services status
bun run ulvia -- instance create preview --label "Preview site"
bun run ulvia -- instance list
bun run ulvia -- instance credentials preview
bun run ulvia -- instance stop preview
bun run ulvia -- instance delete preview --yes
bun run ulvia -- services stop
bun run ulvia -- upgrade edge --version 0.0.1-beta
bun run ulvia -- upgrade provider --version 0.0.1-beta
bun run ulvia -- reset --yes
bun run ulvia -- release ./my-collection
bun run ulvia -- release /path/to/contract-directory
bun run ulvia -- release /path/to/provider-directory
bun run ulvia -- push contract ulvia/cms.installations@1.3.0 --repository https://repository.example
bun run ulvia -- pull collection example/ui@1.0.0 --repository https://repository.example
bun run ulvia -- yank collection example/ui@1.0.0 --repository https://repository.example --reason "Superseded"
bun run ulvia -- restore collection example/ui@1.0.0 --repository https://repository.example
bun run ulvia -- prune
```

`example/ui` is a hypothetical collection to be authored and published explicitly;
no official starter collection is bundled.

The stack version above is an example of an exact published image tag. Workspace
source has no embedded initial stack version: its first `services start`
requires `--version`. Packaged releases embed that default at build time. Later
starts reuse installed digests. Building workspace source does not replace
running images or upgrade installed collections.

The lifecycle commands manage the same Docker Compose projects for loopback and
public installations from any directory. Persistent
data lives below `$XDG_DATA_HOME/ulvia` or `~/.local/share/ulvia`;
`ULVIA_DATA_DIR` remains an explicit isolation override for tests and CI. The
CLI stores authored releases in `<data>/repository`. Shared Provider,
MongoDB, proxy, files, secrets and logs live below `<data>/services`; each
stateless Edge has independent state and logs below `<data>/instances/<name>`.
The CLI never starts application servers, supervises their PIDs, or builds
software images. It pulls only the canonical public images under
`docker.io/cyaxis`, validates their Ulvia component and stack-API labels, and
stores the immutable repository digest selected for each component.

The first lifecycle command creates a safe installation configuration bound to
`127.0.0.1:5100`. Configure public exposure before creating an instance:

```bash
ulvia configure network \
  --bind 0.0.0.0 \
  --http-port 80 \
  --tls acme \
  --https-port 443 \
  --acme-email ops@example.com
ulvia start
ulvia instance create website --domain example.com
```

The configuration is persisted under `<data>/services/installation.json` and
is not a per-start mode. ACME requires `0.0.0.0` and every instance in an ACME
installation requires an explicit DNS domain. Network configuration is locked
after the first instance because its canonical Edge URL is part of Provider
provisioning. The Provider operator port remains loopback-only; a Repository instance is
exposed through its own Edge and the shared proxy.

`services start` starts only the shared proxy, MongoDB and Provider.
On first initialization it uses the exact version embedded by `cli:build`, or
an explicit `services start --version <version>` override. Later starts reuse
the persisted digests and reject a conflicting `--version`; component changes
must go through `upgrade`.
`instance create` provisions one isolated Provider tenant and immediately starts
its dedicated Edge. `instance start` restarts only an already-provisioned
instance's Edge. All Edges use the shared proxy port: an instance named
`default` is available at `http://default.localhost:5100`, while an instance such
as `preview` uses `http://preview.localhost:5100`.
`ULVIA_HTTP_PORT` and `ULVIA_PROVIDER_PORT` provide
initial isolation defaults for tests and CI. Interactive configuration belongs
to `ulvia configure network`. The Provider still listens on its canonical port
5103 inside the private Docker network; only its operator port on the host
changes.
`start` is the idempotent convenience command for shared services plus every
previously created local instance; it never creates an implicit instance.

The lifecycle boundary is deliberate:

A Repository is an ordinary named CMS instance:

```bash
ulvia services start
ulvia instance create registry
ulvia instance status registry
ulvia instance credentials registry
```

Open its `/.cms/setup`, sign in and choose **A new Repository**. The other
buttons accept a Repository address or select `https://repo.ulvia.fr`.
Creation installs system APIs and the administrator, with zero collections and
Pages. Repository settings belong to this instance; there is no `--profile`,
`upgrade-profile`, or shared Repository environment setting. Changing sources
preserves installed pins. An empty site can finish setup offline.

`upgrade provider --version VERSION` replaces the shared image with retention
checks and rollback on activation failure. Installed resources and credentials
remain in Provider storage; explicit contract/collection upgrades use their
admitted workflows. Registry needs no separate image, service or port.

`repository login URL` verifies the Repository identity and saves a shared CMS
PAT supplied through `ULVIA_REPOSITORY_TOKEN` or `--token-stdin`. Ordinary
Repository accounts can claim namespaces and publish without CMS administrator
privileges. Login pins both the origin and Repository identity; writes refuse
redirects and identity changes. Logout deletes the connection and saved PAT
without revoking the remote token.

Client configuration lives in `$XDG_CONFIG_HOME/ulvia/config.json` or
`~/.config/ulvia/config.json`. Files use mode 0600, directories 0700.
`ULVIA_CONFIG_DIR` overrides that location; `ULVIA_DATA_DIR` alone isolates
client configuration under `<data>/config`. Namespaces, accounts, uploads and
releases belong to their CMS instance's Provider storage. Startup never claims
or reassigns a namespace. See the
[installation guide](../../../docs/installation/README.md#9-repository-cms-instance)
and [Repository architecture](../../../docs/architecture/community-repository.md).

| Command | Provider tenant | Edge container |
| --- | --- | --- |
| `services start` | Does not create one | Does not start one |
| `instance create <name>` | Provisions one durable tenant | Creates and starts its Edge |
| `instance start <name>` | Reuses the existing tenant | Starts only that Edge |
| `start` | Never provisions | Starts every existing Edge after shared services |

`instance credentials <name>` prints only that administrator's email and
password. Provider operator and instance bearer tokens remain in
private runtime files. Shared services and every instance have independent
`stop`, `status`, and `logs` boundaries. Software upgrades are explicit and
component-scoped through `upgrade <component> --version <exact-version>`.
Normal starts always reuse the installed digest and never follow a newer tag.
First startup validates cached exact-version images and downloads only missing
images. Explicit upgrades still pull their requested tag.
`reset --yes`
removes shared Compose projects, instances, shared state and local repository
releases, including accounts hosted by this local Provider. Independently deployed
Repositories and the CLI's saved Repository connection are preserved. It does not
inspect or modify the current working directory.
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
ulvia release infra/releases
bun run release:official
# Equivalent SDK source entry:
ulvia release infra/releases
```

The official build uses a trusted local `ulvia.release.ts` entry so all SDK
features, manifest claims and the bootstrap share the same inventory and compiler. See the
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
bun run generate:official-bootstrap
```

That command neither publishes to a running repository nor upgrades an existing
instance. Collections are built and published only from explicitly supplied
sources; no starter collection is included in this command.
For individual manual releases, use `release` in dependency order:
exact parent contracts before specializations, then Provider manifests and collection dependencies.
Publication, system installation transitions, collection upgrades and container
image replacement remain separate actions.

`instance create` provisions the named instance through the Provider operator
API, then starts its Edge. Connection review validates the runtime report and
exact manifest claims. Provider behavior is covered by implementation-owned tests.

Official releases evolve independently: the current installations contract and
Provider manifest use `1.3.0`; local formats remain `v1`. Collections are supplied
and versioned by their authors.
Each named instance uses `<name>.localhost` unless an explicit domain is supplied;
`default` is an ordinary name. Repository hosting uses a CMS instance with the
explicit Registry installation. Client PAT connections and local release caches
are separate from the shared services and instance lifecycle.

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
