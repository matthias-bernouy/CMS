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
bun run ulvia -- upgrade kernel --version 0.0.1-beta
bun run ulvia -- upgrade provider --version 0.0.1-beta
bun run ulvia -- upgrade repository --version 0.0.1-beta
bun run ulvia -- reset --yes
bun run ulvia -- release packages/official-repository/collections/ulvia-official
bun run ulvia -- release /path/to/contract-directory
bun run ulvia -- release /path/to/provider-directory
bun run ulvia -- push contract ulvia.official/ulvia.cms.installations@1.0.0 --repository https://repository.example
bun run ulvia -- pull collection ulvia.official/ulvia-official@1.0.0 --repository https://repository.example
bun run ulvia -- yank collection ulvia.official/ulvia-official@1.0.0 --repository https://repository.example --reason "Superseded"
bun run ulvia -- restore collection ulvia.official/ulvia-official@1.0.0 --repository https://repository.example
bun run ulvia -- prune
```

The stack version above is an example of an exact published image tag. Workspace
source has no embedded initial stack version: its first `services start`
requires `--version`. Packaged releases embed that default at build time. Later
starts reuse installed digests. Building workspace source does not replace
running images or upgrade installed collections.

The lifecycle commands manage the same Docker Compose projects for loopback and
public installations from any directory. Persistent
data lives below `$XDG_DATA_HOME/ulvia` or `~/.local/share/ulvia`;
`ULVIA_DATA_DIR` remains an explicit isolation override for tests and CI. The
CLI stores authored releases in `<data>/repository`. Shared Provider, Repository,
MongoDB, proxy, files, secrets and logs live below `<data>/services`; each
stateless Kernel has independent state and logs below `<data>/instances/<name>`.
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
after the first instance because its canonical Kernel URL is part of Provider
provisioning. Repository and Provider management ports remain loopback-only.

`services start` starts only the shared proxy, MongoDB, Repository and Provider.
On first initialization it uses the exact version embedded by `cli:build`, or
an explicit `services start --version <version>` override. Later starts reuse
the persisted digests and reject a conflicting `--version`; component changes
must go through `upgrade`.
`instance create` provisions one isolated Provider tenant and immediately starts
its dedicated Kernel. `instance start` restarts only an already-provisioned
instance's Kernel. All Kernels use the shared proxy port: an instance named
`default` is available at `http://localhost:5100`, while any other instance such
as `preview` uses `http://preview.localhost:5100`.
`ULVIA_HTTP_PORT`, `ULVIA_REPOSITORY_PORT`, and `ULVIA_PROVIDER_PORT` provide
initial isolation defaults for tests and CI. Interactive configuration belongs
to `ulvia configure network`. The Provider still listens on its canonical port
5103 inside the private Docker network; only its operator port on the host
changes.
`start` is the idempotent convenience command for shared services plus every
previously created local instance; it never creates an implicit instance.

The lifecycle boundary is deliberate:

Independent Repository deployments use `ulvia repository start`, `status`, `stop`
and `upgrade --version <exact-version>`. Their default volume and image pin live
below `<data>/repository-service`. No deployment name or `global`/`community`
qualifier is required. The command does not start
shared services or a Kernel.

`ulvia repository login <url>` verifies and saves the remote identity and creates
a default local signing identity if none exists. `ulvia identity create`, `import`,
`use`, `list` and `public-key` manage reusable Ed25519 identities. Namespace
commands and publication use the saved connection and select an identity matching
the namespace's current owner. No environment exports are needed. `logout`
removes only the connection, preserving keys.

Client configuration lives in `$XDG_CONFIG_HOME/ulvia/config.json` or
`~/.config/ulvia/config.json`; private keys live in its `keys/` directory. Files
use mode 0600, directories 0700. `ULVIA_CONFIG_DIR` overrides that location;
`ULVIA_DATA_DIR` alone isolates client configuration under `<data>/config`.
Deployment configuration is separate: `<data>/repository-service/config.json`.
`repository configure` persists local, external HTTPS proxy or managed ACME
networking. All namespaces, including `ulvia.official`, use public first claim.
Claim platform-owned names locally before enabling public access. Ownership
persists across restarts and cannot be reset through deployment configuration.
See the [installation guide](../../../docs/installation/README.md#9-standalone-repository)
and [Repository architecture](../../../docs/architecture/community-repository.md).

| Command | Provider tenant | Kernel container |
| --- | --- | --- |
| `services start` | Does not create one | Does not start one |
| `instance create <name>` | Provisions one durable tenant | Creates and starts its Kernel |
| `instance start <name>` | Reuses the existing tenant | Starts only that Kernel |
| `start` | Never provisions | Starts every existing Kernel after shared services |

`instance credentials <name>` prints only that administrator's email and
password. Provider operator and instance bearer tokens remain in
private runtime files. Shared services and every instance have independent
`stop`, `status`, and `logs` boundaries. Software upgrades are explicit and
component-scoped through `upgrade <component> --version <exact-version>`.
Normal starts always reuse the installed digest and never follow a newer tag.
`reset --yes`
removes shared Compose projects, instances, shared state and local repository
releases. It preserves independent Repository deployments and signing identities. It does not inspect or modify the current working directory.
`release <resource-directory>` reads `definition.json` and routes by `kind`:
`collection`, `contract`, or `provider-manifest`. It validates and stores one
immutable release. A provider manifest must reference exact contract releases
already in the local repository. Release does not connect to or test a provider.
`release <directory> --recursive` discovers authored resource roots below a
folder, stopping before nested Bloc or conformance definitions. It orders
contracts by inheritance and capability requirements, validates conformance
against the complete planned contract set, then prepares providers and
collections. Existing local dependencies are reused. Source admission happens
before any resource is stored; each resource is committed separately, so a
storage or publication conflict can leave a partial batch. Retrying identical
releases is idempotent. Duplicate coordinates and symbolic links are rejected.
Discovery is bounded to 256 resources, 4096 directories and 32 directory levels;
prepared canonical bytes and assets are bounded to 512 MiB. `push` remains an
explicit separate command.

```bash
ulvia release packages/official-repository/contracts --recursive
ulvia release packages/official-repository --recursive
```

Contract fixture assets declared in `definition.json` are read from
`fixtures/<asset-id>` and verified by digest. Releasing the same coordinate with
different content fails. The local Repository serves stored resources
at `/v1/collections`, `/v1/contracts`, and `/v1/providers` on loopback port
5102, with declared contract fixtures at
`/v1/contracts/<publisher>/<contract>/<version>/fixtures/<asset-id>`, and sees
new releases without restarting. The CMS consumes the collection and provider
repository endpoints. The Provider administration Page imports an exact
manifest, approves an account connection and replaces the site's exact contract
selections for Gateway calls. `prune` empties all local repository content
without deleting service or instance data.

Contract authors may keep only release metadata in `definition.json` and split
capabilities recursively below `capabilities/`. Each capability is one JSON
object. Optional `mocks/**/*.json` fragments contain one mock plus its explicit
`capabilityId`; mocks embedded in capability fragments reject. The compiler
sorts capabilities and mocks by their declared IDs, so paths never affect the
immutable digest. `definition.json` cannot contain an inline `capabilities`
array: the recursive source tree is the only authored contract format.

An optional conformance companion uses `conformance/definition.json`, recursive
`conformance/scenarios/**/*.json` scenario objects and recursive
`conformance/exemptions/**/*.json` coverage-exemption objects. Optional suite
fixture bytes live below `conformance/fixtures/<asset-id>`. The release command
assembles and admits a present suite, including exact locally released
dependencies, before storing the contract. Conformance publication and live
execution are separate Gateway/repository APIs; the CLI does not yet orchestrate
a disposable provider environment.

`push <publisher/id@version>` infers the kind from local cached releases. If the
same coordinate exists in several catalogues, specify `push contract`,
`push collection` or `push provider` to resolve the ambiguity. `pull` still takes
an explicit kind and downloads and re-admits one exact coordinate locally.

`push all` publishes every non-yanked release in the local cache, independently
of the working directory. It orders contract inheritance and requirements,
then providers and known local collection dependencies. All artifacts and every
namespace's local owner key are checked before the first upload. No namespace
is implicitly claimed and releases without an owner key are not silently skipped.
A remote refusal or transfer failure stops the batch; already completed
publications remain visible. Repeating the command reconciles identical releases
and resumes the remainder. The receiving Repository still validates dependency
availability and every immutable artifact. For single pushes, transfer required
dependencies first.

```bash
ulvia push ulvia.official/ulvia.cms.emailer@1.0.0
ulvia push all
```

`repository login` saves the default endpoint; `--repository` and
`ULVIA_REPOSITORY_URL` remain explicit overrides. Owner signatures bind Repository
identity, namespace revision, action, content digest, timestamp and nonce.
The server rejects stale or replayed
requests, serializes writes across processes, re-runs admission and evolution
rules, and stages every declared asset as a separately signed raw stream. A final
idempotent commit makes the immutable artifact visible only after all byte lengths
and SHA-256 digests pass. Interrupted and rejected sessions never expose a partial
release. An exact republish is idempotent; different bytes at an existing coordinate
reject.

The protocol, exact-coordinate client and mutation endpoint live in
`@bernouy/cms-repository/repository/publication`. The CLI uses the publication
client and local filesystem release storage; `official-repository-server`
composes the HTTP listener inside its container. The filesystem composition
persists upload sessions and replay claims below the repository root.
A production repository can replace those ports without depending on this
executable package.

`yank` is reversible catalogue metadata: it hides a release from new catalogue
resolution without deleting its exact historical bytes. `restore` exposes it
again. Contract yanks block new dependent publications while previously
published provider manifests remain readable. The loopback Repository uses the
same owner-signing protocol. Signing keys stay in local identities.

A collection keeps immutable administration copy in recursive locale
directories such as `translations/en/collection.json` and
`translations/en/theme/colors.json`. Every JSON object below
`translations/<locale>/` contributes to that locale's flat catalogue.
Collection, Bloc, setting, text, theme and Page metadata stores
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
`generations` object keyed by those paths. The compiler derives media type,
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

The Official Repository image contains the admitted CMS contracts, provider
manifest, and administration collection. It installs that snapshot only into
absent or empty persistent storage. A non-empty repository is never overlaid on
image upgrade. The workspace bootstrap command builds the admitted snapshot
used by the image:

```bash
bun run generate:official-bootstrap
```

That command neither publishes to a running repository nor upgrades an existing
instance. For individual manual releases, use `release` in dependency order:
exact contract dependencies before dependent contracts and provider manifests.
Publication, provider profile transitions, collection upgrades and container
image replacement remain separate actions.

`instance create` provisions the named instance through the Provider operator
API, then starts its Kernel. Connection review validates the runtime report and
exact manifest claims; it does not yet execute a live conformance suite.
