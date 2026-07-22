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
- Light DOM compositions extend `Composition`. They render fixed templates,
  expose no content slots yet, and keep authored children inert.

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
