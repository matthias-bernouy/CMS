# Create A Collection Bloc

Blocs are authored inside an immutable collection release. The current Control
surface does not mount a private `/api/bloc` importer and no visual editor is
present. `ulvia release` is the supported compilation path; site-owned Bloc
persistence remains a feature API for a future editor, not a second public
authoring format.

## Source Tree

Bloc folders are discovered recursively below a collection's `blocs/` tree.
Grouping folders contain directories only and never contribute to stable IDs.
A folder becomes a Bloc when it contains `definition.json`; its basename must
equal the definition's `id`, and discovery stops at that folder.

```text
blocs/
└── content/
    └── example-card/
        ├── definition.json
        ├── shadowdom.html
        ├── style.css
        ├── bloc.ts
        ├── default.html
        ├── lightdom.html
        ├── settings/
        │   └── definition.json
        └── runtime/
            └── helpers.ts
```

Only files that serve the Bloc contract are accepted. `runtime/` is recursive
and TypeScript-only. `settings/` contains exactly one `definition.json`.
Markup, CSS, settings and runtime code stay out of the root definition so each
responsibility can be reviewed independently.

## Components And Compositions

A `component` requires `shadowdom.html`. `style.css`, `lightdom.html`,
`default.html`, `bloc.ts`, settings and runtime helpers are optional unless a
more specific rule requires them. When `bloc.ts` is absent, the CLI supplies a
minimal `Component` subclass that imports the Shadow DOM and stylesheet.

```ts
import { Component } from "@bernouy/cms-content/browser";
import css from "./style.css" with { type: "text" };
import template from "./shadowdom.html" with { type: "text" };

export class Bloc extends Component {
    constructor() {
        super({ css, template });
    }
}
```

Export one component class. The build wrapper owns `customElements.define()`
for the declared tag. The emitted `runtime.viewJS` field is the immutable
browser artifact name; it is unrelated to the removed collection View model.

A `composition` has only `definition.json`, `lightdom.html` and optional
`default.html`. It has no Shadow DOM, stylesheet, settings or JavaScript. The
server expands it before rendering and loads the transitive component runtimes
used by its markup.

`default.html` supplies initial editable Page content. `lightdom.html` is a
fixed reusable assembly. Changing either in a later release does not silently
rewrite arbitrary site-owned Page content; collection migrations describe
breaking stored-data changes.

## Runtime Rules

Bloc code is a browser bundle shared by Control and Delivery according to its
declared `surfaces`. It imports browser-safe public entries such as
`@bernouy/cms-content/browser`; it must not import Node, Bun, databases,
secrets, runtimes or surface internals.

Keep element lifecycle explicit and release listeners when disconnected.
Prefer semantic HTML and Page references over direct browser navigation. The
quality checks reject arbitrary browser HTTP calls in official collection code;
CMS data access uses literal same-origin `/.cms/call/...` bindings backed by
declared capability requirements.

The current browser host is `window.cmsRuntime`. Its public methods still need
a versioned ABI before immutable third-party releases can be supported. Until
collection JavaScript isolation exists, installable executable code is limited
to reviewed official collections.

## Managed Native Elements

A component can own one editable native Light DOM child through:

```json
{
    "nativeElement": { "accepts": ["button", "a"] }
}
```

Such a component has exactly one unnamed Shadow DOM slot, no fixed
`lightdom.html`, and one direct accepted native child in `default.html`. The
real child tag remains the source of truth. Wrapper settings and native-child
attributes are separate targets even when their names coincide.

The admitted vocabulary is deliberately bounded. Links, buttons, headings,
paragraphs, images and SVGs use typed platform policies; arbitrary `class`,
`style`, event handlers, free-form `data-*` and unvalidated navigation are not
author settings. Rich text remains Page-owned HTML in a declared slot rather
than an HTML string setting.

## Build And Validation

`@bernouy/cms-repository/collections/build` validates the source bundle,
constrains imports and emits the runtime artifact. The CLI then assembles the
collection, admits every Bloc and resource reference, verifies capability
witnesses and computes the immutable release digest.

From the repository root:

```bash
bun run ulvia -- release packages/official-repository/collections/ulvia-official
bun run check:all
bun run build
bun test
```

See [collection admission](collections.md), [bindings](data-bindings.md),
[theming](theming.md) and [validation](validation.md) for the surrounding
contracts.
