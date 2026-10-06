# @bernouy/ulvia-cli

Local development launcher for CmsCore.

```bash
bun run ulvia -- dev
bun run ulvia -- dev status
bun run ulvia -- dev credentials
bun run ulvia -- dev stop
bun run ulvia -- release packages/official-repository/collections/test
bun run ulvia -- release /path/to/contract-directory
bun run ulvia -- release /path/to/provider-directory
bun run ulvia -- push contract ulvia.official/ulvia.cms.jobs@1.0.0 --repository https://repository.example
bun run ulvia -- pull collection ulvia.official/ulvia-official@1.0.0 --repository https://repository.example
bun run ulvia -- yank collection ulvia.official/ulvia-official@1.0.0 --repository https://repository.example --reason "Superseded"
bun run ulvia -- restore collection ulvia.official/ulvia-official@1.0.0 --repository https://repository.example
bun run ulvia -- prune
```

The CLI stores local releases in `ULVIA_DATA_DIR/repository`, or under
`$XDG_DATA_HOME/ulvia/repository` / `~/.local/share/ulvia/repository` by default.
The separate `dev/` directory holds credentials, CMS files, and MongoDB data.
`dev` mounts the authenticated CMS Core provider surface on loopback port 5103.
`dev credentials` prints its bearer token alongside the CMS administrator
credentials.
`release <resource-directory>` reads `definition.json` and routes by `kind`:
`collection`, `contract`, or `provider-manifest`. It validates and stores one
immutable release. A provider manifest must reference exact contract releases
already in the local repository. Release does not connect to or test a provider.
Contract fixture assets declared in `definition.json` are read from
`fixtures/<asset-id>` and verified by digest. Releasing the same coordinate with
different content fails. `dev` serves stored resources
at `/v1/collections`, `/v1/contracts`, and `/v1/providers` on loopback port
5102, with declared contract fixtures at
`/v1/contracts/<publisher>/<contract>/<version>/fixtures/<asset-id>`, and sees
new releases without restarting. The CMS consumes the collection and provider
repository endpoints. Control explores manifests in Settings → Provider
connections, connects an account, then selects exact contract releases in
Explore sources for gateway calls. `prune` empties all local repository content without
deleting `dev/` data.

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
execution remain separate future work.

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
published provider manifests remain readable. The loopback dev server uses the
same write protocol and prints its generated repository token through `dev
credentials`. The removed integration repository/Supabase bridge is not run.

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
keys.

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

The bundled bootstrap already admits the official CMS Core contracts, manifest
and Control collection before starting the local stack. To publish the same
resources manually, release the Core contracts before the manifest:

```bash
bun run ulvia -- release packages/official-repository/contracts/ulvia.cms.access
bun run ulvia -- release packages/official-repository/contracts/ulvia.cms.collections
bun run ulvia -- release packages/official-repository/contracts/ulvia.cms.files
bun run ulvia -- release packages/official-repository/contracts/ulvia.cms.localization
bun run ulvia -- release packages/official-repository/contracts/ulvia.cms.jobs
bun run ulvia -- release packages/official-repository/contracts/ulvia.cms.theme
bun run ulvia -- release packages/official-repository/contracts/ulvia.cms.pages
bun run ulvia -- release packages/official-repository/contracts/ulvia.cms.providers
bun run ulvia -- release packages/official-repository/providers/ulvia.official
bun run ulvia -- dev
```

Local `dev` connects and selects this provider automatically. Manual connection
uses `http://127.0.0.1:5103` and the bearer token from `dev credentials`.
Connection review validates the runtime report and exact manifest claims; it
does not yet execute a live conformance suite.
