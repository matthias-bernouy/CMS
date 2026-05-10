# @bernouy/cms-blocs

Library of CMS blocs (PageBuilder building blocks) consumed by `p9r
import` and shipped to any `@bernouy/cms` deployment that wants the
default kit. **No JS export** — this package is a folder of bloc
sources, discovered by manifest scan, not by import.

## Layout

```
src/
├── action/           buttons + prominent search variants
├── content/          card, chip, feedback, media, stat, strip
├── doc/              documentation-flavored set: api, code, content, layout, meta, navigation
├── form/             choice (radio/checkbox/switch/chip), numeric, select, structure (form/fieldset), temporal, text, upload
├── header/           article, article-meta, page-actions, section, toolbar
├── interactive/      accordion (+ accordion-item), tabs (+ tab), filter-panel, toggle-row
├── layout/           container, grid, hero-{plain,marketing,editorial}, spacing
├── navigation/       footer (+ footer-column), menu (notif-dropdown, user-menu), navbar (navbar, nav-item, navbar-actions), sidenav (+ -section, -item)
└── ambient.d.ts      `*.css` and `*.html` modules → `string`
```

102 manifests today (one per bloc folder). Top-level subfolders are
**categorical**, not architectural — `p9r import` walks recursively and
only cares about `manifest.json`.

## Bloc folder shape

Each leaf folder is one bloc:

```
my-bloc/
├── manifest.json     required, root marker discovered by `p9r import`
├── Bloc.ts           view bundle entry — imports `Component` from `@bernouy/cms/component`
├── BlocEditor.ts     (optional) editor bundle entry — imports `Editor` from `@bernouy/cms/editor`
├── template.html     shadow DOM template (loaded with `with { type: 'text' }`)
├── style.css         shadow DOM CSS (loaded with `with { type: 'text' }`)
└── configuration.html editor config panel (sync elements: `<p9r-attr-sync>`, `<p9r-comp-sync>`, `<p9r-image-sync>`, `<p9r-link>`, …)
```

`manifest.json` minimum:

```json
{
    "runtime":       "0.0.1",
    "bloc":          "./Bloc.ts",
    "editor":        "./BlocEditor.ts",
    "default-tag":   "base-button",
    "default-group": "Action",
    "meta": {
        "author":      "Be5 Solutions",
        "title":       "Button",
        "description": "Reusable action button …",
        "categories":  ["action"]
    }
}
```

- `default-tag` is the custom-element tag **and** the DB primary key on
  the CMS server. It must be globally unique. `p9r-*` and `w13c-*` are
  reserved system prefixes — never scaffold a bloc with them.
- `editor` is optional. Without it, the bloc becomes opaque (the CMS
  CLI synthesizes a default editor that calls `registerEditor_opaque`).
- `runtime` matches the cms component runtime version that compiled
  against this manifest schema.

## How blocs ship

This package never ships JS. Two consumption paths:

- **`p9r import`** (CLI in `@bernouy/cms`) — scans
  `node_modules/@bernouy/cms-blocs/src/**/manifest.json`, builds each
  bloc into a view + editor bundle via `Bun.build`, POSTs to the
  remote CMS's `/api/bloc`. The CMS server stores `{ id, group,
  description, viewJS, editorJS }`. Blocs whose `default-tag` already
  exists are skipped (collisions are loud, never overwritten).
- **`p9r dev`** — same scan, but builds locally and serves via the dev
  proxy so the bloc reloads on file change.

The TS in this package is type-checked via `tsc` (project ref to
`../cms` for `@bernouy/cms/component` + `@bernouy/cms/editor` types) but
**never bundled by this package's `build`** — bundling is the CLI's job
on the consumer side.

## Bloc authoring contract

Inherits the rules in `.claude/rules/cms-bloc-development.md`:

- **No icon fonts.** Use SVG/PNG/JPEG. Inline SVG (with
  `fill="currentColor"`) for swappable icons via `<p9r-svg-sync>`;
  hardcoded SVG for design ornaments.
- **CSS-first.** Layout via Flex/Grid; only reach for JS when CSS
  truly can't.
- **Pre-compute on the editor side.** Heavy calculations live in
  `BlocEditor.ts`; the runtime stores results as attributes / slot
  content.
- **Theme variables, never hardcoded values.** Use the `--primary-base`,
  `--bg-surface`, `--text-main`, `--border-default` family. Anything
  not covered must become a configurable attribute.
- **Text inside a leaf `<span>`.** Editor anchoring breaks if a text
  node sits next to sibling elements, or if a `<span>` wraps both
  elements and a text node.
- **Slots empty in `template.html`**, populated by `<p9r-comp-sync>` in
  `configuration.html`. Two sources of truth would diverge as soon as
  the user removes a child.
- **`<p9r-comp-sync>` never empty.** An empty sync element causes
  editor bugs; always wrap a child.
- **Navigation:** `<a href>` for static, `history.pushState` for
  conditional. Never assign to `location.*` — the editor cannot
  intercept it (Location members are `[[LegacyUnforgeable]]`), and the
  push-time `validateBloc` rejects the pattern.

## CSS imports

Blocs import HTML/CSS as text via Bun's import attributes:

```ts
import template from './template.html' with { type: 'text' };
import css      from './style.css'     with { type: 'text' };
```

`ambient.d.ts` declares these modules return `string` so TS doesn't
complain. `template`/`css` are passed verbatim to the
`Component({ template, css })` constructor; nothing else processes them.

## Dependencies

- runtime: `@bernouy/cms` (`Component`, `Editor`)
- peer / dev: TypeScript

The package has no `main`/`exports` — it ships sources only. Adding a
public TS export here would be a category mistake; if you need a shared
helper across blocs, lift it to `@bernouy/cms` or `@bernouy/webcomponents`.
