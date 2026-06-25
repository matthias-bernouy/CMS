# Editor Binding Core Contract

The CMS binding system is a site/runtime capability, not a user-authored bloc.
All implementations must expose the same activation element:

```html
<cms-binding-core>
    {{CONTENT}}
</cms-binding-core>
```

The tag is intentionally stable across implementations. An implementation may change the
JavaScript implementation registered behind the custom element, but it must not
change the public HTML contract. Use `CMS_BINDING_CORE_TAG` instead of hard-coded
strings in TypeScript code.

## Activation Scope

`<cms-binding-core>` owns one binding scope. A binding runtime should only
activate binding features for descendants of that element:

- `{{ expression }}` text interpolation.
- `cms-source` data fetching and source scoping.
- `cms-repeat` repeated rendering.
- `cms-condition` conditional rendering.
- `cms-slot="loading|empty|error"` alternate source-state content.

Nested binding cores are isolated scopes. An implementation can choose the precise
runtime mechanics, but it should not leak data scopes across nested cores.

## Disabled Scope

`cms-binding-disabled` disables all binding behavior inside a core:

```html
<cms-binding-core cms-binding-disabled>
    <p>{{ title }}</p>
</cms-binding-core>
```

When disabled, an implementation must not fetch sources, evaluate conditions, repeat
content, or interpolate expressions. The DOM should remain inert authored HTML.
This is meant for editor previews, static rendering modes, and sites that do
not enable a binding system.

## Forced Source State

`cms-source-state-force` forces every `cms-source` inside the core to render as
a chosen source state:

```html
<cms-binding-core cms-source-state-force="loading">
    <section cms-source="/api/products">
        <p cms-slot="loading">Loading...</p>
        <p cms-slot="empty">No products.</p>
        <p cms-slot="error">Could not load products.</p>
        <article cms-repeat="items as product">{{ product.name }}</article>
    </section>
</cms-binding-core>
```

Valid values are `loaded`, `loading`, `empty`, and `error`.

When a forced state is present:

- `loading`, `empty`, and `error` should render the matching `cms-slot` content
  for each source without performing the source fetch.
- `loaded` should behave like the normal loaded path. An implementation may still fetch
  real data in this state.
- The attribute belongs to the binding core, not to each source. It is a global
  preview/debug control for the current page scope.

The editor should treat this as preview state and must not persist it into saved
content unless the user explicitly edits the shell/runtime configuration.

## Implementation Responsibilities

A binding implementation must:

- Register a custom element with `CMS_BINDING_CORE_TAG`.
- Respect `CMS_BINDING_ATTRIBUTES.bindingDisabled`.
- Respect `CMS_BINDING_ATTRIBUTES.sourceStateForce`.
- Treat `CMS_BINDING_ATTRIBUTES.slot` values as authored source-state slots.
- Leave the public tag and attribute names unchanged.

An implementation may:

- Choose how expressions are evaluated.
- Choose how data sources are fetched and cached.
- Add private `data-*` attributes or internal state for debugging.
- Expose richer editor preview APIs later.

Do not add implementation-specific public tag names such as
`custom-provider-binding-core`. The implementation is hidden behind
`cms-binding-core`.
