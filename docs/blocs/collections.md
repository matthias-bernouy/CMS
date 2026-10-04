# Collections

Control exposes private site collections, compiled code blocs, and immutable
collections installed from a repository. Private compositions are editable;
installed blocs are read-only and can be placed on pages.

## Local collection releases

Author a declarative collection folder such as
`packages/official-repository/collections/ulvia-official/`. It is not a Bun workspace package.

```text
packages/official-repository/collections/ulvia-official/
├── definition.json          # collection identity, version, locale and metadata
├── blocs/**/<bloc>/definition.json
├── blocs/**/<bloc>/shadowdom.html  # required for components
├── blocs/**/<bloc>/lightdom.html   # required for compositions, optional for components
├── blocs/**/<bloc>/default.html    # optional initial page-owned slot content
├── blocs/**/<bloc>/settings/definition.json  # optional component settings
├── blocs/**/<bloc>/style.css    # optional for shadow components
├── blocs/**/<bloc>/bloc.ts      # optional browser behavior
├── texts/definitions/**/*.json  # text IDs and administration metadata
├── texts/locales/<locale>/**/*.json  # site-overridable content defaults
├── translations/<locale>/**/*.json  # reusable administration copy fragments
├── migrations/**/<from>-to-<to>.json  # adjacent declarative data transitions
├── theme/definition.json    # ordered theme category IDs
├── theme/**/*.json          # recursively organized category/token defaults
├── definitions/             # reserved for later collection definitions
├── views/<view>/definition.json  # view identity, label and capability requirements
├── views/<view>/view.html   # Control HTML fragment
└── dashboards/<dashboard>/definition.json  # navigation tree of local views
```

`definition.json` may publish a selective `exports` surface containing Bloc
tags and collection-local theme token IDs. Its `dependencies` entries identify
one collection and publisher, constrain its version, and list only the exported
Blocs and tokens this release imports. External Bloc references in `uses`, slot
acceptance or authored markup must be present in that import list. The site
single-release installer requires dependencies first and revalidates the complete
acyclic graph on install and upgrade. The core installation store can also commit
an exact multi-release dependency graph atomically when a caller has already
selected every release.

`bun run ulvia -- release packages/official-repository/collections/ulvia-official` assembles the
supported files into one `ulvia-collection/v1` release, validates it, and
stores immutable canonical bytes in the user's local repository. That repository
lives at `ULVIA_DATA_DIR/repository`, or below `$XDG_DATA_HOME/ulvia/repository`
or `~/.local/share/ulvia/repository` by default. `bun run ulvia -- dev` serves
only stored releases on loopback port 5102 (`ULVIA_DEV_REPOSITORY_PORT` can
change it); it never scans authored folders. Run `release` again after editing
the source and increment its version. Contracts required by Blocs or Views must
already exist in the local repository. `bun run ulvia -- prune` empties the
local repository without deleting the separate dev CMS data. Pull and push
transfer one exact release between the local store and an HTTPS repository:

```bash
ULVIA_REPOSITORY_TOKEN=... bun run ulvia -- push collection ulvia.official/ulvia-official@1.0.0 --repository https://repository.example
bun run ulvia -- pull collection ulvia.official/ulvia-official@1.0.0 --repository https://repository.example
```

Contracts and provider manifests use the same commands and must be transferred
before dependants. Remote writes are timestamped, nonce-bound and HMAC-signed;
the receiving repository re-runs admission, dependency and SemVer/generation
checks while holding its write lock. `yank` hides a release from new catalogue
resolution without deleting historical bytes, and `restore` reverses it. The
current release format does not install the `definitions/` directory. No direct
collection JSON upload is available in Control.

### Collection admission limits

Limits are enforced when every collection release is admitted, whether it is
created locally, pulled from a repository or received by the official
repository server:

| Resource | Maximum per release |
| --- | ---: |
| Canonical collection document | 8 MiB |
| Blocs | 512 |
| Assets | 1,024 |
| Content texts | 4,096 |
| Views | 256 |
| Dashboards | 128 |
| Collection dependencies | 128 |
| Theme categories | 64 |
| Theme tokens across all categories | 4,096 |

Structural sub-resources remain bounded as well: 512 adjacent migration files
with 512 operations each, 256 settings and 32 slots per Bloc, and 32 capability
requirements per Bloc or View. Dashboard navigation accepts 64 items in total,
with at most 16 at one level and three levels.

One asset remains limited to 10 MiB and all asset bytes in one release remain
limited to 50 MiB. These are hard collection limits: a release exceeding any
one of them is rejected. The publication transport accepts larger generic
repository artifacts, but that transport ceiling does not override collection
admission. Collection assets are therefore intended for immutable resources
shipped with the release, such as icons, fonts, images and small documents.
Larger videos, audio files or documents belong in the CMS media/file system.

Import and export lists use the limit of their resource kind rather than the
Bloc limit. Authored sources may use `"*"` for an entire `exports` object or one
of its `blocs`, `themeTokens`, `texts` or `assets` selections. The release
command expands that shorthand before admission, excludes internal Blocs from
a wildcard Bloc selection and stores an explicit sorted list in the immutable
release. Dependency imports never accept wildcards.

Components use `shadowdom.html`, optional fixed `lightdom.html`, optional
`style.css`, and optional `bloc.ts`.
Bloc folders may be grouped at any supported depth below `blocs/`. A directory
containing `definition.json` is a Bloc root and stops recursive discovery; its
basename must equal the Bloc ID. Parent grouping directories contain only
directories and never contribute to the Bloc ID, label or runtime bundle.
An optional translated `category` and nonnegative integer `order` in the Bloc
definition control its author-facing catalogue group and position. Source folder
names remain organizational only.
The release command generates a default component runtime when `bloc.ts`
is absent. Compositions use `lightdom.html` without a browser component class.
Their template is shared across every page using the installed release; an
upgrade changes every rendering. Named `<slot>` elements in `lightdom.html`
accept page-owned children, optionally initialized from `default.html`.
For a component with both DOM layers, its host remains and its fixed Light DOM
children project into the Shadow DOM slots. For a composition alone, Delivery
replaces the temporary host with the expanded template.
Admission forbids inline `style` attributes everywhere, permits `class` only
inside Shadow DOM, and permits bindings only inside Light DOM. Shadow shells
also reject visible text, links, headings and images, so crawlable content stays
in Light DOM.

A component may instead declare one page-owned managed native child:

```json
{
    "kind": "component",
    "id": "example-action",
    "nativeElement": {
        "accepts": ["button", "a"]
    },
    "slots": {}
}
```

Such a component cannot have `lightdom.html`. Its `shadowdom.html` must expose
exactly one unnamed `<slot>`, `default.html` must contain exactly one direct,
un-slotted accepted native root, and `slots` must remain empty. The native child
is the structural source of truth: `<button>` and `<a>` are two valid instances
of the example contract, without a duplicate `as` attribute on the wrapper.
The accepted list is also sufficient for a future editor to offer a structural
element selector. Changing that selector replaces the real native child rather
than changing only presentation metadata.

Settings always target the custom-element wrapper. Native attributes and text
belong to the child. Therefore the wrapper and its child may safely carry an
attribute with the same name; they are validated and edited as separate DOM
targets. Components embedded in another collection template must still contain
a concrete accepted child. A composition may place its own editable slot inside
that child, for example `<example-heading><h2><slot
name="heading"></slot></h2></example-heading>`.

Slot acceptance distinguishes components, media and editorial content.
`plain-text` describes an unformatted page-owned text region. `rich-text`
requires the closed `inline` or `prose` profile and is intended to drive a
future bounded rich-text editor. In both cases the stored value remains real
page HTML assigned to the slot; it is not collection configuration, an encoded
HTML attribute or an EditorJS document.

Component attributes may be declared in the bloc's `definition.json` under
`settings`, or in a separate `settings/definition.json`. The release command
rejects using both locations for one bloc. Settings are an ordered JSON array;
each item has an `id`, `label`, `type` and `default`, plus an optional `group`.
String items may set `minLength` and `maxLength`; an omitted `maxLength`
defaults to 256. Finite numbers and safe integers may set `minimum` and
`maximum`. Every item has a declarative `control`. String controls are `text`,
`select`, `segmented`, `color`, `page-link`, `media-picker` and
`theme-token-picker`; booleans use `toggle`; numeric settings use `number` or a
bounded `range`. Select and segmented options carry stable string values and
author-facing labels. The same items supply insertion defaults and the
server-side value schema. Numeric HTML attributes must use JSON number syntax;
empty strings, hexadecimal forms, `NaN` and infinities reject.
An item may add `visibleWhen: { "setting": "tone", "equals": "accent" }`;
`notEquals` and arrays of accepted values are supported. Multiple rules form
an AND condition. Conditions may reference a boolean item or a string item
with finite select or segmented options, including items in another group.
Admission rejects unknown references, incompatible values, self references and
cycles. Visibility affects only the authoring control: hidden attributes remain
stored and are still validated.
Changing a controlling value does not clear other attributes.
Inserting a bloc writes its default attributes onto that page's host, and page
saves validate changed values against the installed schema. `bloc.ts` remains
optional behavior code; it is not required to describe the settings panel.
Long or formatted editorial content does not belong in a string setting. Use a
page-owned rich-text slot instead. Media normally belongs in a media slot;
`media-picker` is reserved for configuration such as a background or poster.

`GET <basePath>/api/collections/available` lists configured sources and release
metadata. `POST <basePath>/api/collections/install` takes a repository ID, release
identity, digest and site revision. Control fetches the release server-side,
validates its identity and digest, then installs or upgrades it. Explore collections
groups releases by collection, shows the latest version, and offers Manage or
Upgrade when a newer release is available. Immutable
release bytes and mutable per-site state are stored separately. An upgrade
retains site text overrides and checks revision and compatible resource IDs.

## Release evolution and migrations

The collection SemVer remains the publication version. Each Bloc, theme token,
configuration, text, View and dashboard also has a positive `generation`
(default `1`) and deterministic contract and implementation digests. An
implementation-only change leaves the contract digest stable. A compatible
contract extension may change the contract digest without changing the resource
generation; a breaking contract requires a generation increment.

The local repository enforces that policy before storing a publication. A patch
may change resource implementations only. A minor may add resources and make
compatible contract extensions without changing existing resource generations.
A major may break contracts or remove exports, but each changed surviving
resource increments its generation and the collection advances its
`dataGeneration`. One publication advances that data generation by at most one.

`dataGeneration` describes the format of site-owned data. It increments only
when pages, collection configuration, text overrides or site theme overrides
need a transition. A release at generation `N` contains the complete adjacent
chain `1→2`, `2→3`, …, `N-1→N`; a site at generation `X` executes each retained
step through `Y`. This avoids direct `X→Y` migration files while keeping old
sites upgradeable.

Migration files contain only bounded declarative operations. They can rename a
Bloc, rename/add/remove/map a setting, rename a theme token, move/add/remove/map
a configuration value, and rename or remove a text override. Arbitrary
JavaScript migration code is not accepted.

Control exposes administrator-only plan, execute, status, resume and rollback
endpoints below `<basePath>/api/collections/migration/`. Planning validates the
complete target collection graph, transformed pages, configuration, text
overrides and theme references without changing the installed site state. Page
planning and snapshot verification use stable ID cursors in batches of at most
500 pages; neither path loads every page body through `getAllPages()`. The plan
response returns at most 500 affected-page previews plus `totalPages`; its digest
still covers every exact affected-page snapshot. Only pages whose content
actually changes are retained for rollback.
Execution then:

1. enters maintenance and drains writes already in flight;
2. scans the final stable snapshot and stages rollback pages in bounded batches;
3. activates the technical journal and rechecks collection, page and feature digests;
4. atomically commits all target collection pins;
5. rewrites affected pages with compare-and-swap revisions;
6. validates the result and commits the transformed site theme.

Delivery returns `503` with `Retry-After` while a migration is active. Control
keeps reads and migration recovery available, but ordinary writes return `423`.
A failed run stays in maintenance until it is resumed or rolled back. Rollback
is rejected if committed collections or migrated pages changed afterward. Page
revisions always increase, including rollback; they are concurrency tokens, not
page-version history.

Mongo stores the journal header and each affected page snapshot separately, so
the journal does not hit one aggregate document-size ceiling. Planning, forward
execution, validation, resume and rollback consume those snapshots in bounded
batches. Incomplete staging rows have a TTL and are removed when activation
fails. Public maintenance checks read only the lightweight active state and
never hydrate page snapshots. A renewable token fences each worker: heartbeat
failure or lease replacement stops further journal and content writes, and a
stale worker cannot release its successor's lease.

## Workspace

The admin entry point is `<basePath>/admin/collections`. The collection key is
encoded in these routes:

- `<basePath>/admin/collections/<collection>/overview`
- `<basePath>/admin/collections/<collection>/theme`
- `<basePath>/admin/collections/<collection>/blocs`
- `<basePath>/admin/collections/<collection>/texts`

The theme workspace projects installed collection tokens into the shared site
theme. The collection owns token definitions and defaults; the site may edit
token values. Delivery includes the resulting CSS variables in its public
stylesheet. The Texts workspace groups translations by category and group and
persists site overrides. Delivery replaces `cms.i18n` expressions on the server
after expanding installed compositions. Catalogue values are static; dynamic
parameters and plural forms are not collection text features.

`GET <basePath>/api/collections/workspace` supplies the workspace snapshot.
`GET <basePath>/api/collections/installed` returns installed releases and site
state. `PUT <basePath>/api/collections/texts` saves site text overrides with an
expected revision.

## Private and code blocs

`GET <basePath>/api/bloc/collections` returns private collections, including the
virtual default **Site** collection. `POST` accepts
`{ name, description?, icon? }`; `PUT ?id=<id>` updates metadata. `POST
<basePath>/api/site-bloc` creates a private composition and accepts
`{ name, description?, group?, collectionId?, tag? }`. Omitting the collection
ID uses **Site**.

`GET <basePath>/api/bloc/library` supports collection, search, category,
visibility and bloc filters. The response groups blocs and includes selected
bloc metadata. Private compositions are editable; compiled code blocs are
read-only.

## Current limits

The installed-collection bridge accepts compositions and Shadow components,
including fixed Light DOM, named slots and initial page content. Verified asset
bytes and revision-checked collection configuration are implemented. The store
can remove a collection after checking installed dependants, but Control does not
expose removal until it can also report affected pages, private Blocs, theme
references and dashboards. Remote registry transfer and authenticated
publication are implemented by the CLI and filesystem reference registry.
Production hosting, key rotation and multi-publisher authorization remain
deployment work. JavaScript trust scanning is also separate; migration files
themselves are data-only. Collection Views can render local or explicitly
imported Blocs; Control expands compositions, loads the transitive component
runtime (including internal Blocs), resolves collection texts and public assets,
and applies the site theme. Capability calls are authorized against the selected
View and all of its transitive Bloc requirements. Dashboards only define
navigation and activation: their source list is derived from those Views.
Activating a dashboard compiles CMS-owned execution grants for its Views. Each
plan pins the collection digest, View generation, provider-selection revision,
contract release digest and installation. Calls fail closed after an upgrade or
selection change until the dashboard is activated against the new state. A source
adapter exists for multiple repositories, while the dev runtime configures one local source.
Repository catalogue responses are currently bounded to 256 releases and are not
paginated. This is an explicit V1 limit: a production repository must add cursor
pagination, and clients must consume it, before any one catalogue can exceed 256
visible releases. Exact-coordinate reads are not affected by this catalogue limit.
The current first-party JavaScript trust decision and the intended sandbox
boundary for future third-party collections are recorded in
[deferred platform work](../TODO.md#collection-javascript-isolation).

See the [collection release format](../../packages/features/cms-repository/src/collections/README.md)
for admission constraints.
