# @bernouy/components

CMS blocs and admin custom elements toolkit. Two component flavors:

- **`<p9r-*>`** — visual UI components (Button, Card, Tabs, Toast,
  Input, Select, …) consumed by every CMS admin page and by blocs.
- **`<w13c-*>`** — logical components (`<w13c-form>`) for declarative
  submit with no per-page JS. Declarative **data binding** lives in
  `src/binding/` (attribute-driven runtime; see below).

Published to npm as `@bernouy/components` (MIT). Other workspace
packages (`@bernouy/cms-control`) consume the **built bundle**
from `dist/`, not the sources.

## Layout

```
src/
├── base/
│   └── Component.ts          minimal HTMLElement base — open shadow root, optional CSS + template injection
├── ui/                       all <p9r-*> visual components
│   ├── Accordion/  Alert/  Avatar/  Badge/  Breadcrumb/  Card/
│   ├── Dialog/     Divider/  Form/  HorizontalActionGroup/
│   ├── Layout/     Menu/     Pagination/  Progress/  Skeleton/
│   ├── Spinner/    Stepper/  Table/  Tabs/  Tag/  Toast/  Tooltip/
│   └── …
├── logicalComponents/        <w13c-*> behavioral components
│   └── Form/Form.ts          <w13c-form> — declarative submit
├── binding/                  data-binding runtime — <cms-binding-core> + cms-source/cms-repeat/{{ }}/#{}/cms-param-sync
├── assets/
│   └── default.css           global theme tokens (--primary-*, --bg-*, --text-*, --border-*, --danger-*, …)
├── types/                    shared TS types
└── index.ts                  enumerated exports of every class
```

`dist/` (built) holds:
- `index.js`        — ESM bundle exporting every component class. It does
  **not** register custom-element tags.
- `style.css`       — copy of `src/assets/default.css`.
- `blocs/<name>.{mjs,d.ts}` — per-component ESM + d.ts stub so consumers
  can lazy-load a single component class:
  `import "@bernouy/components/blocs/button"`.
- `index.d.ts` + the tsc-emitted tree (for `import { Button } from "@bernouy/components"`).

## Build (`build.ts`)

The build is hand-rolled, three steps:

1. `Bun.build(src/index.ts → dist/index.js, format: "esm", minify)`.
2. For each entry in the **flat list at the top of `build.ts`**, build
   ESM with `Bun.build`, and write a `.d.ts` stub re-exporting from the
   tsc-emitted declarations.
3. `cp src/assets/default.css → dist/style.css`, then `tsc -p
   tsconfig.build.json` for the type tree.

**Adding a new component**:
1. Create `src/ui/MyThing/MyThing.ts` (+ `template.html`, `style.css` if needed).
2. Do **not** call `customElements.define()` in the component source.
3. `export { MyThing } from "./ui/MyThing/MyThing"` in `src/index.ts`.
4. Add an entry to the `blocs` array in `build.ts` so consumers can
   import it as `@bernouy/components/blocs/my-thing`.

Step 4 is **required for lazy import**, but optional if the component
is only meant to ship via `ui.js`. Forgetting it gives you a working
component but no per-component bundle.

## Component base — what it does and doesn't do

`src/base/Component.ts` is intentionally tiny:

```ts
class Component extends HTMLElement {
    constructor(metadata?: { css, template }) {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        if (metadata) { /* inject <style>{css} + <template>{template} */ }
    }
    connectedCallback() {} // override in subclass
}
```

- Open shadow root, every component.
- CSS / template injection is optional — `Stack.ts` and similar passthroughs may skip it when the shadow already inherits styling.
- **No reactive lifecycle or attribute helper.** Subclasses add what they need.
- This base `Component` is the single shared one. `@bernouy/cms-control/component`
  re-exports it — don't introduce a divergent CMS `Component`.

## Registration

This package is classes-only. Component sources must not self-register.
Consumers that need custom elements register the exported classes explicitly
with their own tag names. The CMS admin does this centrally in
`@bernouy/cms-control`'s browser entrypoint.

## Form components

Form-bearing components (`Button`, `Checkbox`, `Switch`, `RadioGroup`,
`P9rInput`, `P9rSelect`, …) declare `static formAssociated = true` and
attach `ElementInternals`. They participate in native form submission
and `setCustomValidity` flows. Don't reach for shadow DOM listeners to
forward values — `ElementInternals.setFormValue()` is the right tool.

## Logical components

`<w13c-form>` wraps an inner `<form>`, posts JSON to `target` on
submit, dispatches `form:success` / `form:failed` (bubbles + composed
via `BubblesEvent`). `emit="some:event"` re-dispatches on success so a
`cms-source` with a matching `cms-reload-on` refreshes. Uses
`BubblesEvent` (a `CustomEvent` with `bubbles + composed = true`) so
events escape shadow boundaries.

## Data-binding runtime (`src/binding/`)

Attribute-driven, activated only inside a `<cms-binding-core>` custom
element (the activation root; nested cores are isolated islands — no data
mixing). Replaced the old `<cms-fetch>` / `<template for>` system.

- `cms-source="url"` — fetch JSON, render the element's body against it.
  States via `cms-slot="loading|error|empty"`; reload via
  `cms-reload-on="event-name"` (document events). A `<template>` body is
  captured **inert** (for active components that pre-render their light
  DOM); live body otherwise (e.g. `<p9r-table>` rows that must be direct
  children for `<slot>`).
- `cms-repeat="path"` / `"path as name"` — iterate an array.
- `{{ path }}` — interpolate against the scope chain (blank on miss; raw,
  not HTML-escaped — DOM-API safety). `{{ x | innerHTML }}` injects raw
  HTML (unwraps the placeholder; trusted content only).
- `#{param}` — REACTIVE query-param ref, resolved per fetch; the source
  reloads on change. Use it to forward a param (`?id=#{id}`) — sources do
  NOT auto-forward `location.search`.
- `cms-param-sync` on an input — two-way value↔query-param.

## Theme variables

`src/assets/default.css` defines the design tokens that every visual
component reads via `var(...)`:

| Family | Tokens |
|---|---|
| Surfaces | `--bg-base`, `--bg-surface`, `--bg-overlay` |
| Text     | `--text-main`, `--text-body`, `--text-muted`, `--text-label` |
| Borders  | `--border-default`, `--border-light` |
| Primary  | `--primary-base`, `--primary-muted`, `--primary-contrasted` |
| Secondary| `--secondary-base`, `--secondary-muted`, `--secondary-contrasted` |
| Status   | `--danger-*`, `--success-*`, `--info-*`, `--warning-*` (each as `-base`/`-muted`/`-contrasted`) |
| Context  | `--ctx-bg`, `--ctx-fg`, `--ctx-fg-muted`, `--ctx-border` — the *current surface*; neutral by default, re-routed to `*-contrasted*` by colour-variant provider blocs |

**Context aliases (`--ctx-*`)** implement a provider/consumer colour context.
A *provider* — a `variant`-bearing wrapper like `base-footer` or
`base-hero-marketing` — re-points `--ctx-bg/-fg/-fg-muted/-border` to the chosen
variant's `*-base` / `*-contrasted*` tokens; *consumers* (slotted text, nested
blocs, the RichText "Contextual" swatch) read `var(--ctx-fg)` so they stay
legible on whatever surface they sit on. The neutral defaults above resolve to
the surface/text tokens.

Consumers serve `dist/style.css` at a stable URL (typically
`<basePath>/resources/css/cms-blocs.css`) and `@import` it from
their own admin stylesheet so the tokens are in scope before any
component renders.

## Conventions

- **Name a visual component `<p9r-*>`** — never `<cms-*>` or `<w13c-*>`.
  Logical components are `<w13c-*>`. `cms-*` is reserved for the CMS
  internal admin shell (lives in `@bernouy/cms-control`).
- **Never self-register from component sources.** Export the class only.
- **Imports of `*.html` / `*.css` use `with { type: 'text' }`** so Bun
  inlines them as strings. Keep them under 100 lines per file; split
  `style.css` into `base.css` + `variant.css` (à la `Form/Button/`)
  when style logic grows.
- **Theme tokens, never hardcoded colors.** If a component needs a hue
  outside the token set, the consumer should expose it as an attribute
  rather than the component baking it in.
- **No external runtime deps.** This package is published to npm
  standalone — keep it free of `@bernouy/*` imports.
- **Sources are not consumed directly.** Workspace packages depend on
  the **built bundle** (`@bernouy/components` resolves to
  `dist/index.js` via `main`/`exports`). The workspace root `build.ts`
  builds this package first so consumer packages see the `dist/`
  artifacts at type-check time.

## Reference docs in repo

- `conventions/API.md` — public API conventions (attribute names,
  events).
- `conventions/EVENTS.md` — event taxonomy.
- `W13C-EVENTS.md` — known logical-component events
  (`form:success` → modals close, `form:failed`, …).

These are short notes, not exhaustive reference. The source is the
contract.

## Dependencies

- runtime: none
- peer: `typescript ^5`
