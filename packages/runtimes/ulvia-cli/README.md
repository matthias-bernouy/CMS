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
bun run ulvia -- prune
```

The CLI stores local releases in `ULVIA_DATA_DIR/repository`, or under
`$XDG_DATA_HOME/ulvia/repository` / `~/.local/share/ulvia/repository` by default.
The separate `dev/` directory holds credentials, CMS files, and MongoDB data.
`dev` also starts the loopback official provider on port 5103. `dev credentials`
prints its bearer token alongside the CMS administrator credentials. The
provider keeps form submissions in its own `dev/official-provider/` directory.
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
deleting `dev/` data. Pull and push remain future commands; the removed
integration repository/Supabase bridge is not run.

A collection keeps immutable administration copy in recursive locale
directories such as `translations/en/collection.json` and
`translations/en/theme/colors.json`. Every JSON object below
`translations/<locale>/` contributes to that locale's flat catalogue.
Collection, Bloc, setting, text, theme, View and dashboard metadata stores
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

To try the official provider, release these resources in order, then start `dev`
and open `/admin/settings/providers` on the Control port:

```bash
bun run ulvia -- release packages/official-repository/contracts/catalog.items
bun run ulvia -- release packages/official-repository/contracts/forms.submissions
bun run ulvia -- release packages/official-repository/contracts/media.assets
bun run ulvia -- release packages/official-repository/providers/ulvia.official
bun run ulvia -- dev
```

Import the provider manifest from Explore providers. Connect the provider at
`http://127.0.0.1:5103` with the bearer token from `dev credentials`. Review
and approve the connection, then connect the three contract releases separately
from Explore sources.
The connection review validates the runtime report and exact manifest claims;
it does not yet execute a live conformance suite. This provider is a local
development fixture with one account and a static catalogue and SVG asset.
