# Bloc Authoring

CmsCore Blocs separate four concerns:

| Concern | Owner | Purpose |
| --- | --- | --- |
| Page content | Site author | The Light DOM stored in a Page document. |
| Browser runtime | Bloc author | Optional component behavior and Shadow DOM. |
| Authoring contract | Collection | Settings, slots, defaults and native-element policy. |
| Theme | Site and collection | Shared tokens plus deliberate component extension points. |

One Page document and one rendering pipeline serve every Page. Pages and Blocs
do not declare a surface. The Kernel derives Page access from the capabilities
used by the Page and its transitive Blocs. There is no collection View or
Dashboard renderer. Administration Pages expose the active installed Bloc
catalogue through the visual Page editor.

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
  -> shared Kernel Page renderer
```

Collection components and compositions are fully renderable. Administration
Pages are mounted from installed collections and call official CMS contracts
through `/.cms/call`; public Pages use the same Bloc artifacts. The
browser host remains presentation-free and visual components live in
collections.

Starting `ulvia dev` launches the local stack and bootstraps the admitted
official resources. It does not watch arbitrary source folders: release an
authored directory explicitly when its contents change.
