# Bloc Authoring

CmsCore Blocs separate four concerns:

| Concern | Owner | Purpose |
| --- | --- | --- |
| Page content | Site author | The Light DOM stored in a Page document. |
| Browser runtime | Bloc author | Optional component behavior and Shadow DOM. |
| Authoring contract | Collection | Settings, slots, defaults and native-element policy. |
| Theme | Site and collection | Shared tokens plus deliberate component extension points. |

One Page document and one rendering pipeline serve both surfaces. A Page owns
exactly one surface (`control` or `delivery`); a Bloc may support one or both.
There is no collection View, Dashboard renderer or active visual editor.

## Guides

- [Collection API](collections.md): immutable resources, imports/exports,
  generations, installation and migrations.
- [Collection texts](texts.md): recursive definitions/locales, fallback and
  server interpolation.
- [Create a Bloc](authoring.md): recursive folders, components, compositions,
  native elements and compilation.
- [Bindings](data-bindings.md): declarative sources, repetition and forms.
- [Theming](theming.md): tokens, CSS variables, slots and container-aware
  layout.
- [Validation](validation.md): release, workspace and runtime checks.

## Current Execution Path

```text
authored collection sources
  -> ulvia release + collection build toolchain
  -> strict admission + immutable digest
  -> repository publication
  -> site installation and exact execution plans
  -> shared Control/Delivery Page renderer
```

Collection components and compositions are fully renderable. Control Pages are
mounted from installed collections and call official CMS contracts through
`/.cms/call`; Delivery uses the same Bloc artifacts for public Pages. The
browser host remains presentation-free and visual components live in
collections.

Starting `ulvia dev` launches the local stack and bootstraps the admitted
official resources. It does not watch arbitrary source folders: release an
authored directory explicitly when its contents change.
