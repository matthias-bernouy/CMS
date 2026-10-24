# @bernouy/ulvia-cli

Ulvia installation and release CLI.

```bash
bun run ulvia -- start
bun run ulvia -- configure network
bun run ulvia -- services status
bun run ulvia -- instance create preview --label "Preview site"
bun run ulvia -- instance list
bun run ulvia -- instance credentials preview
bun run ulvia -- instance stop preview
bun run ulvia -- instance delete preview --yes
bun run ulvia -- services stop
bun run ulvia -- services upgrade
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

The lifecycle commands manage the same Docker Compose projects for loopback and
public installations from any directory. Persistent
data lives below `$XDG_DATA_HOME/ulvia` or `~/.local/share/ulvia`;
`ULVIA_DATA_DIR` remains an explicit isolation override for tests and CI. The
CLI stores authored releases in `<data>/repository`. Shared Provider, Repository,
MongoDB, proxy, files, secrets and logs live below `<data>/services`; each
stateless Kernel has independent state and logs below `<data>/instances/<name>`.
The CLI never starts application servers or supervises their PIDs.

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

| Command | Provider tenant | Kernel container |
| --- | --- | --- |
| `services start` | Does not create one | Does not start one |
| `instance create <name>` | Provisions one durable tenant | Creates and starts its Kernel |
| `instance start <name>` | Reuses the existing tenant | Starts only that Kernel |
| `start` | Never provisions | Starts every existing Kernel after shared services |

`instance credentials <name>` prints only that administrator's email and
password. Repository, Provider operator and instance bearer tokens remain in
private runtime files. Shared services and every instance have independent
`stop`, `status`, `logs` and explicit `upgrade` boundaries. `reset --yes`
removes every Compose project, instance, shared state and repository
release. It does not inspect or modify the current working directory.
`release <resource-directory>` reads `definition.json` and routes by `kind`:
`collection`, `contract`, or `provider-manifest`. It validates and stores one
immutable release. A provider manifest must reference exact contract releases
already in the local repository. Release does not connect to or test a provider.
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

`push` publishes one exact local coordinate, and `pull` downloads and re-admits
one exact remote coordinate before storing it locally. Both support
`collection`, `contract`, and `provider`; dependencies must be transferred
first. `ULVIA_REPOSITORY_URL` can replace `--repository`.
Repository writes require `ULVIA_REPOSITORY_TOKEN`; the token is never accepted
as a command-line argument. Every mutation carries a timestamp, one-time nonce,
body digest, and HMAC-SHA-256 signature. The server rejects stale or replayed
requests, serializes writes across processes, re-runs admission and evolution
rules, and stages every declared asset as a separately signed raw stream. A final
idempotent commit makes the immutable artifact visible only after all byte lengths
and SHA-256 digests pass. Interrupted and rejected sessions never expose a partial
release. An exact republish is idempotent; different bytes at an existing coordinate
reject.

The protocol, exact-coordinate client and mutation endpoint live in
`@bernouy/cms-repository/repository/publication`; the CLI only composes them with
the reference filesystem adapter and its loopback listener. The filesystem
composition persists upload sessions and replay claims below the repository root.
A production repository can replace those ports without depending on this
executable package.

`yank` is reversible catalogue metadata: it hides a release from new catalogue
resolution without deleting its exact historical bytes. `restore` exposes it
again. Contract yanks block new dependent publications while previously
published provider manifests remain readable. The loopback Repository uses the
same write protocol and keeps its generated repository token in the private
runtime directory. The removed integration repository/Supabase bridge is not
run.

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

The bundled bootstrap already admits the official CMS contracts, provider manifest
and administration collection before starting local services. To publish the same
resources manually, release the CMS contracts before the manifest:

```bash
bun run ulvia -- release packages/official-repository/contracts/ulvia.cms.access
bun run ulvia -- release packages/official-repository/contracts/ulvia.cms.installations
bun run ulvia -- release packages/official-repository/contracts/ulvia.cms.content
bun run ulvia -- release packages/official-repository/contracts/ulvia.cms.files
bun run ulvia -- release packages/official-repository/contracts/ulvia.provider.cms-instances
bun run ulvia -- release packages/official-repository/providers/ulvia.official
bun run ulvia -- start
```

`instance create` provisions the named instance through the Provider operator
API, then starts its Kernel. Connection review validates the runtime report and
exact manifest claims; it does not yet execute a live conformance suite.
