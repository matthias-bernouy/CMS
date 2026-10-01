# Bloc Authoring

CmsCore blocs are reusable HTML elements with four separate contracts:

| Contract | Owner | Purpose |
| --- | --- | --- |
| Authored content | Site author | The Light DOM saved in pages. |
| View | Bloc author | Browser behavior and optional Shadow DOM structure. |
| Authoring metadata | Collection or CMS platform | Declarative settings, content slots, defaults, and native-element policy. |
| Theme | Site and Bloc authors | Site-wide design tokens plus deliberate Bloc-level extension points. |

Keeping these contracts separate is the central design rule. Authoring metadata
describes what an author may change; it is not a second renderer. The view owns
runtime behavior; it must still work in Delivery where no editor is present.
The theme supplies shared values; a Bloc keeps responsibility for its own
layout and semantics.

## Choose A Starting Point

- [Collection API](./collections.md) covers the library projection, site
  compositions, and code-backed collections.

- [Collection Texts](./texts.md) covers JSON catalogues, locale fallback, server
  interpolation and the checkout fixture.
- [Create a Bloc](./authoring.md) covers folders, the manifest, runtime code,
  templates, default content, registration, and browser constraints.
- [Bind Data And Sources](./data-bindings.md) covers declarative source
  markup, loading states, repetition, forms, and the binding-core boundary.
- [Make A Bloc Themeable](./theming.md) covers global themes, tokens, local CSS
  variables, attributes, `::part`, slots, dark mode, and responsive layout.
- [Develop And Validate](./validation.md) covers the local loop,
  validation rules, and Delivery loading during the provider transition.

## Current Execution Paths

```text
compiled Bloc sources -> Control import + compiler -> stored view bundle
site composition      -> Control authoring         -> stored composition artifact
stored artifacts      -> Control preview and Delivery

ulvia-collection/v1 bundle -> repository admission -> validated authored bundle
                                                   (renderer bridge pending)
```

Starting `ulvia dev` launches the local CMS; it does not scan, compile or publish
a collection folder. See [validation](validation.md) for the available checks.

The same saved HTML is used by authoring surfaces and Delivery. Do not make
Delivery depend on authoring-only DOM or controls.

## Scope Of This Guide

These pages document existing compiled Blocs and site compositions, and identify
the separate collection admission work. Site compositions live as CMS data.
The CMS supplies the constrained native HTML catalogue; imported compiled Blocs
and new collection components cannot replace native roots.

Responsive image behavior is documented separately in
[Responsive Images](../images/README.md).
