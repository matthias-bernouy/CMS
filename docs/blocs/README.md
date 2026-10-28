# Bloc Authoring

CmsCore Blocs separate four concerns:

| Concern | Owner | Purpose |
| --- | --- | --- |
| Page content | Site author | Semantic Light DOM stored in a Page. |
| Structure and style | Bloc author | Fixed Light DOM and validated scoped CSS. |
| Optional behavior | Bloc author | A mount function on the native `cms-bloc` root. |
| Authoring contract | Collection | Native roots, slots, defaults and settings. |

Blocs do not create custom elements or Shadow Roots. Their stable identity is
the value of `cms-bloc` on a native element. One Page document and one Edge
rendering pipeline serve public and administration Pages.

## Guides

- [Collections](collections.md): immutable resources, dependencies and installation.
- [Collection texts](texts.md): definitions, locales and fallback.
- [Create a Bloc](authoring.md): source layout, native roots, CSS and behavior.
- [Bindings](data-bindings.md): declarative queries, rendering and forms.
- [Theming](theming.md): tokens, scoped styles and responsive layout.
- [Validation](validation.md): release, document and runtime checks.

## Execution Path

```text
authored collection sources
  -> ulvia release + Bloc build
  -> strict admission + immutable digest
  -> repository publication
  -> site installation and static capability analysis
  -> Edge server composition
  -> native Light DOM + optional bloc-runtime.js behavior
```
