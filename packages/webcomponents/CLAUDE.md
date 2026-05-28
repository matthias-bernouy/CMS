# @bernouy/webcomponents

Lightweight Web Components toolkit. Two component flavors:

- **`<p9r-*>`** — visual UI components (Button, Card, Tabs, Toast,
  Input, Select, …) consumed by every CMS admin page and by blocs.
- **`<w13c-*>`** — logical components (`<w13c-form>`, `<w13c-fetch>`)
  that handle declarative submit/fetch with no per-page JS.

Published to npm as `@bernouy/webcomponents` (MIT). Other workspace
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
├── logicalComponents/        all <w13c-*> behavioral components
│   ├── Form/Form.ts          <w13c-form> — declarative submit
│   └── data/fetch/           <w13c-fetch> — declarative fetch + slot stamp
├── assets/
│   └── default.css           global theme tokens (--primary-*, --bg-*, --text-*, --border-*, --danger-*, …)
├── types/                    shared TS types
└── index.ts                  enumerated exports of every class
```

`dist/` (built) holds:
- `ui.js`           — IIFE bundle that imports `src/index.ts` once. A
  single `<script src="…/dist/ui.js"></script>` (or `import
  "@bernouy/webcomponents"` from a bundler that respects the IIFE
  default) registers **every** `<p9r-*>` and `<w13c-*>` tag.
- `style.css`       — copy of `src/assets/default.css`.
- `blocs/<name>.{js,mjs,d.ts}` — per-component IIFE + ESM + d.ts stub
  so consumers can lazy-load a single component:
  `import "@bernouy/webcomponents/blocs/button"`.
- `index.d.ts` + the tsc-emitted tree (for `import { Button } from "@bernouy/webcomponents"`).

## Build (`build.ts`)

The build is hand-rolled, three steps:

1. `Bun.build(src/index.ts → dist/ui.js, format: "iife", minify)`.
2. For each entry in the **flat list at the top of `build.ts`**, build
   IIFE + ESM with `Bun.build`, and write a `.d.ts` stub re-exporting
   from the tsc-emitted declarations.
3. `cp src/assets/default.css → dist/style.css`, then `tsc -p
   tsconfig.build.json` for the type tree.

**Adding a new component**:
1. Create `src/ui/MyThing/MyThing.ts` (+ `template.html`, `style.css` if needed).
2. Self-register at the bottom of the file:
   `if (!customElements.get("p9r-my-thing")) customElements.define("p9r-my-thing", MyThing);`.
3. `export { MyThing } from "./ui/MyThing/MyThing"` in `src/index.ts`.
4. Add an entry to the `blocs` array in `build.ts` so consumers can
   import it as `@bernouy/webcomponents/blocs/my-thing`.

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
- **No reactive lifecycle, no attribute helper, no CSS-variable
  rewriting.** Subclasses add what they need.
- The CMS (`@bernouy/cms-control/component`) ships its **own** richer
  `Component` for blocs. Don't merge the two — the CMS version drags
  bloc-editor concerns that have no place in a plain admin dialog.

## Self-registering pattern (idempotent guard)

Every component file ends with:

```ts
if (!customElements.get("p9r-thing")) {
    customElements.define("p9r-thing", Thing);
}
```

The guard matters: `dist/ui.js` (IIFE) AND a per-component bundle
(`dist/blocs/thing.js`) can both end up loaded on the same page (e.g.
admin loads ui.js, a bloc lazy-loads `blocs/thing.js`). Without the
guard the second load throws "already defined".

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
sibling `<w13c-fetch reload-on>` can refresh.

`<w13c-fetch>` fetches JSON from `url`, stamps a child `<template>`
against the response, inserts the result as siblings. Slots: `default`
(data), `loading`, `error`, `empty`. `reload-on="event-name"` listens
on `document` for refresh triggers; `cms-fetch:reload` is built in.
Public `el.reload()`.

Both use `BubblesEvent` (a `CustomEvent`-equivalent with `bubbles +
composed = true`) so events escape shadow boundaries.

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

Consumers serve `dist/style.css` at a stable URL (typically
`<basePath>/resources/css/webcomponents.css`) and `@import` it from
their own admin stylesheet so the tokens are in scope before any
component renders.

## Conventions

- **Name a visual component `<p9r-*>`** — never `<cms-*>` or `<w13c-*>`.
  Logical components are `<w13c-*>`. `cms-*` is reserved for the CMS
  internal admin shell (lives in `@bernouy/cms-control`).
- **Self-register with the idempotent guard** at the bottom of the
  component file. Never register from `index.ts`.
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
  the **built bundle** (`@bernouy/webcomponents` resolves to
  `dist/ui.js` via `main`/`exports`). The workspace root `build.ts`
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
