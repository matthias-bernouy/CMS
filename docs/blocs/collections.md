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
├── blocs/<bloc>/definition.json
├── blocs/<bloc>/shadowdom.html  # required for components
├── blocs/<bloc>/lightdom.html   # required for compositions, optional for components
├── blocs/<bloc>/default.html    # optional initial page-owned slot content
├── blocs/<bloc>/settings/definition.json  # optional component attributes and authoring controls
├── blocs/<bloc>/style.css    # optional for shadow components
├── blocs/<bloc>/bloc.ts      # optional browser behavior
├── texts/*.json             # arrays of localized text definitions
├── theme/definition.json    # theme categories and light/dark token defaults
├── definitions/             # reserved for later collection definitions
├── views/<view>/definition.json  # view identity and label
├── views/<view>/view.html   # Control HTML fragment
└── dashboards/<dashboard>/definition.json  # navigation tree of local views
```

`bun run ulvia -- release packages/official-repository/collections/ulvia-official` assembles the
supported files into one `ulvia-collection/v1` release, validates it, and
stores immutable canonical bytes in the user's local repository. That repository
lives at `ULVIA_DATA_DIR/repository`, or below `$XDG_DATA_HOME/ulvia/repository`
or `~/.local/share/ulvia/repository` by default. `bun run ulvia -- dev` serves
only stored releases on loopback port 5102 (`ULVIA_DEV_REPOSITORY_PORT` can
change it); it never scans authored folders. Run `release` again after editing
the source and increment its version. `bun run ulvia -- prune` empties the
local repository without deleting the separate dev CMS data. Pull and push
remain future commands. The current release format does not install the
`definitions/` directory. No direct collection JSON upload is available in
Control.

Components use `shadowdom.html`, optional fixed `lightdom.html`, optional
`style.css`, and optional `bloc.ts`.
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
persists site overrides. Delivery interpolates `cms.i18n` expressions on the
server after expanding installed compositions.

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
including fixed Light DOM, named slots and initial page content. Asset bytes,
provider grants, configuration editing, uninstall and registry publication
remain future work. Basic HTML views, collection dashboard templates and
private site dashboards are available; views currently receive only dashboard
metadata through Control binding. Provider execution plans are not implemented.
A source adapter exists for multiple repositories, while the dev runtime
configures one local source.

See the [collection release format](../../packages/features/cms-repository/src/collections/README.md)
for admission constraints.
