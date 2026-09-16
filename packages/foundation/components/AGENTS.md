# @bernouy/components

Foundation UI package. It ships public custom elements and the declarative
binding runtime used by Control, Delivery, and authored blocs.

## Boundaries

- This package has no runtime dependency on other `@bernouy/*` packages.
- Component sources export classes only. They must not call
  `customElements.define()`.
- Consumers use the built `dist/` artifacts through package exports.
- `@bernouy/cms-control/component` re-exports this package's base `Component`;
  do not create another CMS-specific base class.

## Component Families

- `<p9r-*>`: visual components such as buttons, inputs, cards, tables, tabs,
  menus, media controls, and toasts.
- `<w13c-*>`: logical components such as declarative forms.
- Binding runtime: `<cms-binding-core>` plus `cms-source`, `cms-repeat`,
  `cms-condition`, `cms-reload-on`, `#{param}`, `{{ path }}`, and
  `cms-param-sync`.
- Reusable light-DOM compositions are server-expanded CMS resources. They do
  not belong in this foundation package and must not define a client class.

`cms-*` tag names are reserved for Control internals, even when the binding
runtime uses a `cms-` activation tag.

## Adding A Component

1. Add `src/ui/<Family>/MyThing/MyThing.ts` plus optional `template.html` and
   `style.css`.
2. Export the class from `src/index.ts`.
3. Add a lazy bundle entry to `src/tooling/build.ts` if consumers should import
   `@bernouy/components/blocs/my-thing`.
4. Keep HTML/CSS imports using `with { type: "text" }`.

## Forms

`p9r-money-input` exposes integer minor units through `value` and native form
submission while displaying localized major units. `currency` and
`allow-decimals` control formatting and validation. Consumers must not parse its
display text again; typed JSON forms declare `cms-form-value-type="number"`.

`p9r-modal[placement="end"]` presents a full-height side panel on desktop and a
full-screen panel on mobile, using the same native dialog lifecycle as a centered
modal. `content-layout="contained"` lets
slotted content own its scrolling and chrome; use `no-close` only when that
content supplies an accessible close action through `hide()`/`beforeclose`.

`p9r-tabs[expanded]` shows all panels as labelled regions and hides its tab bar,
without moving or recreating panel content. Removing `expanded` restores the
selected tab. Consumers can use this mode for responsive columns.

`w13c-lateral-menu[variant="embedded"]` reuses the lateral navigation contract
inside a page region without imposing viewport height, fixed sidebar width,
background, or border. A containing layout can expose its compact trigger with
the `--menu-embedded-toggle-display` and `--menu-embedded-sidebar-display`
properties. Items using `match="hash"` track in-page anchors and expose
`aria-current="location"`. Add `scrollspy` to let the menu derive same-document
targets from item `href` fragments and follow their viewport position. The
observer owns the controlled active state, updates the URL fragment with
`replaceState`, and reflects the active item in the embedded mobile trigger.
Compact layouts can configure the open sidebar as an anchored, bounded popover
through the `--menu-embedded-open-*` properties.
`scrollspy-offset` optionally sets a fixed viewport-top offset in pixels;
`--menu-scrollspy-offset` supports a responsive CSS offset when the attribute is
absent.
`w13c-lateral-menu-section` adds a compact, collapsible group of menu items.
Use `label`, optional `count`, and `open`; keep navigable entries as direct
`w13c-lateral-menu-item` children so keyboard navigation follows visible groups.
Use `sticky` when section headings need to remain visible inside a bounded,
scrolling menu region.

`w13c-left-menu-layout` accepts `primary-mobile-label` and
`secondary-mobile-label` slots for contextual drawer controls. `p9r-nav-tabs`
and `p9r-nav-tab` present route navigation without mounting tab panels; use the
`fit` variant when a short, fixed set should compress without horizontal
scrolling. Counts are optional and disappear below 350px in that variant.

Form-associated visual components use `static formAssociated = true` and
`ElementInternals`. Update values with `setFormValue()` and validity with
`setCustomValidity()`; do not forward form values through ad-hoc shadow DOM
events.

## Binding Runtime

Binding activates only inside `<cms-binding-core>`. Nested cores are isolated.

- `cms-source="url"` fetches JSON and renders the element body.
- `cms-condition="$source.loading"`, `$source.error`, `$source.empty`, or
  `$source.loaded` defines source states.
- `cms-repeat="items"` or `cms-repeat="items as item"` iterates arrays.
- `cms-repeat="$range(5) as index"` iterates fixed zero-based indices.
- `{{ path }}` interpolates text. `{{ path | innerHTML }}` injects trusted raw
  HTML.
- `#{param}` reads a reactive query parameter and reloads affected sources.
- `cms-param-sync` binds an input value to a query parameter.

## Theme

Use design tokens from `src/assets/default.css`: `--bg-*`, `--text-*`,
`--border-*`, `--primary-*`, `--secondary-*`, status tokens, and `--ctx-*`
context aliases. Do not hardcode product colors in reusable components.

## Build

`bun run build` creates:

- `dist/index.js`
- `dist/style.css`
- `dist/blocs/*.mjs`
- TypeScript declarations

The root workspace build runs this package before TypeScript project
references, because downstream packages consume the generated declarations and
bundle.
