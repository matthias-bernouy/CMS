# Collections

Collections are immutable, provider-neutral release artifacts. They contribute
Blocs, examples, texts, theme entries and assets to a site. The repository admits
and stores releases; installation projects their resources into Content.

## Authored Layout

```text
collection/
├── definition.json
├── blocs/**/<bloc>/
│   ├── definition.json
│   ├── markup.html
│   ├── style.css
│   ├── bloc.ts
│   ├── settings/definition.json
│   └── runtime/**/*.ts
├── examples/**/<example>/definition.json
├── examples/**/<example>/document.html
├── texts/definitions/**/*.json
├── texts/locales/<locale>/**/*.json
├── translations/<locale>/**/*.json
├── theme/definition.json
├── theme/**/*.json
├── assets/**/*
└── assets/definition.json           # optional resource deprecations
```

Bloc folders may be grouped recursively. The folder basename is the Bloc ID;
grouping paths never become identities. Every Bloc uses `markup.html`;
`definition.json.kind` decides whether its native host is retained as a
component or replaced as a server-expanded composition.
`style.css` and `bloc.ts` are optional where the Bloc kind allows them.
Listed Blocs require a translated description, nonempty `categories`, examples
and one `defaultExample`. Examples carry their documents, collection text references and
fixed viewport preview dimensions. Captures are generated outside source releases. There
are no `template.html`, `lightdom.html` or `shadowdom.html` sources.

## Bloc Documents

Every Bloc declares a native `root` contract. Instances use a native element
with the Bloc identity in `cms-bloc`:

```html
<section cms-bloc="example-hero"></section>
```

The fixed markup, Page-owned defaults and Page documents are all Light DOM.
Nested Blocs use the same representation. Named slots declare exact accepted
Blocs, `any-component`, `plain-text`, or bounded `native-content` profiles.
Cardinality is enforced at every write boundary. Compositions are expanded on
the server and are not accepted by `any-component`.

A retained Bloc may declare a bounded default slot accepting a
`native-element`, such as an input or select enhanced by behavior. Root and
child contracts each declare accepted native tags and constrained native
attributes. This is ordinary slot validation, not a second content mechanism.

CSS is parsed, checked, and wrapped in
`@scope ([cms-bloc="<id>"]) to (:scope [cms-bloc])` by the build. The lower
boundary prevents a parent Bloc stylesheet from crossing into a nested Bloc.
Shadow DOM selectors and global selectors are rejected. Named markup slots
become Light DOM `part` tokens after projection.

Behavior is optional. When present, `bloc.ts` exports one `mount(root)` function
and returns cleanup when it installs listeners or observers. The build owns
registration with `bloc-runtime.js`; collection code cannot define custom
elements or create Shadow Roots.

Iframe origins and sandbox permissions are exact Bloc capabilities declared in
`definition.json`. Admission checks them against `markup.html` and
example documents, and rejects programmatic iframe creation.
Catalogue entries expose a deterministic browser-risk report and digest.
Install and upgrade requests acknowledge that precise digest; a repository
change to browser authority therefore requires a fresh selection. Collections
with JavaScript remain trusted code in the main document for the MVP, as
documented in [Deferred Platform Work](../TODO.md).

## Page Grammar

The CMS injects no default Page wrapper. Every non-empty Page root must be an
active installed Bloc on a valid native root. Native elements can appear only
where a Bloc contract owns them. The same grammar validates examples,
defaults, local Page writes, publication, installation and reviewed release switches.

Host attributes are limited to declared settings, admitted native root
attributes and platform binding/placement attributes. Native descendants use
tag-specific policies for semantics, accessibility, URL safety and controlled
forms. Hardcoded user-facing collection copy is rejected in favor of collection
texts.

## Settings, Imports And Exports

Settings are ordered typed items. They define insertion defaults, finite
editor controls and the persisted host-attribute schema. A release may export
exact Blocs, tokens, texts, assets and states. Dependencies import only resources
exported by an exact publisher/collection version constraint. The CLI may
expand authored `"*"` exports into explicit sorted IDs; imports never accept
wildcards.

All local and imported references, cycles, capability requirements and theme
token references are checked before the release becomes visible.

## Assets And SVG

The release command discovers every file below `assets/`. Its normalized
lowercase relative path is its immutable collection-local ID:

```text
assets/icons/check.svg       -> icons/check.svg
assets/fonts/interface.woff2 -> fonts/interface.woff2
```

Assets are not declared in the collection `definition.json`. The optional
`assets/definition.json` is metadata for the scanner itself and accepts only
lifecycle metadata:

```json
{
    "deprecations": {
        "icons/check.svg": { "reason": "icon.deprecation" }
    }
}
```

The scanner derives the media type, byte length and digest. Admission verifies
the exact byte set and recognizable media signatures. A small,
presentation-only SVG is additionally granted the `inline-svg` profile after
its geometry has passed bounded parsing. Active elements, text, external
references, IDs, classes, styles, arbitrary colors and raw XML features are
rejected from that profile.

Authored Page and Bloc HTML never contains SVG geometry. It declares an empty
reference instead:

```html
<svg
    cms-svg="{{ cms.asset.example.icons/check.svg }}"
    role="img"
    aria-label="Completed"
></svg>
```

Decorative icons use `aria-hidden="true"` and no label. The server resolves,
revalidates and expands the immutable SVG before returning HTML; the browser
does not fetch or execute an icon script. Collection-authored references must
use a local asset or an explicitly imported exported asset, and the selected
release must expose the `inline-svg` profile. A site-owned Page may also
reference a canonical same-site `/.cms/call/` URL, but the response must be an
anonymous immutable SVG with a strong ETag.

## Releases And Installation

```bash
bun run ulvia -- services start --version 1.0.0
bun run ulvia -- instance create preview
```

Once the Repository has initialized, validate and store a new authored release:

```bash
bun run ulvia -- release /path/to/new-collection-version
```

`release` assembles, compiles and admits canonical bytes into the local
repository. `1.0.0` is an example published stack version required on first
startup from the unbundled source CLI. The Repository container serves stored
releases; it never scans authored folders. `dev` is no longer a CLI command.
Releasing or rebuilding locally does not replace the running server images or
an installed collection; installation and upgrade remain explicit actions.
Do not prefill an empty installation with only a collection before starting the
Repository: its official seed runs only against absent or empty storage.
Push and pull transfer exact immutable releases and the receiving repository
re-runs admission. A yank hides a release from new selection without deleting
historical bytes.

Installation validates the entire selected dependency graph. Release switches
require a current applicable plan proving compatibility with actual site usage.
Incompatible resource contracts require new IDs; upgrades never rewrite Pages.

## Admission Limits

The principal current limits are 8 MiB for the canonical collection document,
512 Blocs, 1,024 assets, 4,096 texts, 128 dependencies, 64 theme
categories and 4,096 theme entries. One asset is limited to 10 MiB and the
release asset total to 50 MiB. Slots, settings, requirements and examples have their own bounded counts.

See [Create A Collection Bloc](authoring.md) for the source contract and
[Validation](validation.md) for the full validation path.

## Release Changes

See [Reviewed Release Upgrades](../architecture/release-upgrades.md) for stable
identities, inventories, explicit target configuration, grants, retention and
interrupted-switch recovery. Upgrades do not transform site-owned Pages.

## Copying Examples Into Pages

Collections do not declare Pages, paths, localized SEO or publication state.
An example is a generic document: one Bloc, a composition or a complete document.
Its translated label and description describe the catalogue entry, not Page SEO.
`previews[].frame` always defines a viewport; interactive capture actions are not supported.

Administrators browse `ulvia.cms.content/examples.list` for one installed
collection, with an explicit locale and bounded pagination. `examples.get`
returns one generic document without a locale or theme parameter. Its normal
collection text references remain intact. These are read operations, independent
of Page creation. An editor may explicitly replace references with literal text
when it wants Page-owned wording.

An editor or AI may reuse this HTML, modify it, or author a document from scratch.
`pages.create` takes optional `content` HTML; omitting it creates an empty draft.
`pages.update` takes ordinary HTML and the current Page `expectedRevision`.
There is no example source field or dedicated copy/import operation.

Stored Pages contain HTML and ordinary resource references, with no example
coordinate, origin or digest. Editing, replacing, upgrading a collection or
removing an example never synchronizes the copy. Live Bloc, asset and text
references still participate in the usual reviewed upgrade checks.

The official profile copies its administration and system examples into ordinary
published Content Pages during provisioning. Durable provisioning receipts prevent
reseeding edited, renamed or deleted Pages; receipts are outside Page content.
There is no collection Page reader, migration or second route registry. Old
`pages` fields, Page imports/exports and `pages/` source directories are rejected.
Use fresh instance storage for this incompatible development format change.
