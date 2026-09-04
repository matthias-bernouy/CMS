# Bloc Authoring

CmsCore blocs are reusable HTML elements with four separate contracts:

| Contract | Owner | Purpose |
| --- | --- | --- |
| Authored content | Site author | The Light DOM saved in pages. |
| View | Bloc author | Browser behavior and optional Shadow DOM structure. |
| Editor | Bloc author | Settings, content slots, text editing, data scopes, and preview states. |
| Theme | Site and Bloc authors | Site-wide design tokens plus deliberate Bloc-level extension points. |

Keeping these contracts separate is the central design rule. The editor
describes what an author may change; it is not a second renderer. The view owns
runtime behavior; it must still work in Delivery where no editor is present.
The theme supplies shared values; a Bloc keeps responsibility for its own
layout and semantics.

## Choose A Starting Point

- [Create a Bloc](./authoring.md) covers folders, the manifest, runtime code,
  templates, default content, registration, and browser constraints.
- [Expose Editing Capabilities](./editor.md) covers settings, slots, inline
  text, opaque structure, lifecycle hooks, data scopes, and preview states.
- [Bind Data And Sources](./data-bindings.md) covers declarative CMS Source
  markup, loading states, repetition, forms, and the binding-core boundary.
- [Make A Bloc Themeable](./theming.md) covers global themes, tokens, local CSS
  variables, attributes, `::part`, slots, dark mode, and responsive layout.
- [Develop, Validate, And Publish](./validation.md) covers the local loop,
  validation rules, Delivery loading, audited releases, and publication.

## End-To-End Model

```text
manifest.json + Bloc.ts + BlocEditor.ts + default.html
                         |
                         v
                ulvia audit / release
                    |           |
                    |           +--> ulvia dev loads the CMS editor
                    |
                    +--------------> Delivery loads only required view bundles

site theme --------------------------------> inherited CSS custom properties
saved Light DOM ---------------------------> slots, text, and bound attributes
```

The same saved HTML is used in the editor and in Delivery. Do not put essential
rendering in `BlocEditor.ts`, depend on editor-only DOM, or make the Delivery
view wait for authoring controls.

## Scope Of This Guide

These pages document Blocs owned by collection integrations. Collections keep
their source under their integration directory, declare selectable resources,
and are audited and released with the `ulvia` CLI. Site-specific composition
lives as CMS data rather than as a copied repository template.

Responsive image behavior is documented separately in
[Responsive Images](../images/README.md).
