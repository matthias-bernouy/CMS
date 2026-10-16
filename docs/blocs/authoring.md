# Create A Collection Bloc

Blocs are authored inside immutable collection releases. `ulvia release` is
the supported compilation path; the Kernel never imports an authored folder at
runtime.

## Source Tree

Bloc folders are discovered recursively below `blocs/`. A folder becomes a
Bloc at `definition.json`; its basename must equal the definition `id`.

```text
blocs/content/example-card/
├── definition.json
├── template.html       # optional fixed Light DOM for retained Blocs
├── lightdom.html       # required for server-expanded compositions
├── default.html        # optional initial Page-owned content
├── style.css           # optional, compiled into a scoped stylesheet
├── bloc.ts             # optional behavior
├── settings/definition.json
└── runtime/helpers.ts
```

Grouping folders contain directories only. A component Bloc requires
`template.html`; a composition requires `lightdom.html`. Compositions cannot
have styles, settings, behavior or fixed component content.

## Native Roots

Every Bloc declares which native element may carry its identity:

```json
{
    "id": "example-card",
    "kind": "component",
    "root": { "accepts": ["article", "div"] },
    "slots": {}
}
```

A Page instance is ordinary semantic HTML:

```html
<article cms-bloc="example-card"></article>
```

Collection custom-element tags are forbidden. The Bloc ID remains a stable,
namespaced identity, but it is stored in `cms-bloc` instead of becoming the DOM
tag name. Pages therefore stay crawlable and accessible without JavaScript.

A wrapper Bloc may declare `content` to manage exactly one Page-owned native
child, for example an enriched `<input>` or `<select>`. The wrapper root and
managed child have separate native contracts. Native links require a real
`href`; interactive descendants are rejected.

## Light DOM And CSS

All visible content lives in Light DOM. Shadow DOM, `attachShadow`,
`shadowRoot`, `:host`, `::part` and `::slotted` are not part of the Bloc model.
`template.html` owns fixed structural Light DOM; `default.html` supplies
initial Page-owned children that must satisfy the Bloc slot contract.

`style.css` is parsed during the build and wrapped in a collection-owned native
scope:

```css
@scope ([cms-bloc="example-card"]) to (:scope [cms-bloc]) {
    :scope {
        display: grid;
    }

    [part~="title"] {
        font-weight: 700;
    }
}
```

Authors write the inner rules; the compiler owns the outer `@scope`. Global
selectors, document selectors, Shadow DOM selectors and unsafe external CSS
are rejected. Consumed named slots become `part` tokens after projection so
the scoped stylesheet can target the resulting Light DOM structure.

CSS custom properties are part of the collection contract rather than an
unrestricted global namespace. A component can declare and consume variables
prefixed by its complete Bloc ID, for example
`--example-card-title-color`. It can consume or assign another Bloc's variables
only when that Bloc is declared in `uses`. Theme variables must resolve to a
local or explicitly imported theme token. Unknown, unqualified and foreign
variables are rejected when the release is admitted. Runtime
`style.setProperty()` calls follow the same ownership rule and require a static
literal variable name.

## Optional Behavior

Most Blocs need no JavaScript. When native HTML and bindings are insufficient,
export a mount function:

```ts
export function mount(root: HTMLElement): () => void {
    const button = root.querySelector("button");
    const onClick = () => root.toggleAttribute("open");
    button?.addEventListener("click", onClick);
    return () => button?.removeEventListener("click", onClick);
}
```

`mount(root)` is the only behavior entrypoint. Shared functional helpers from
`@bernouy/cms-content/browser` provide ownership-safe queries, bounded attribute
observation and explicit native form-control connections. The build wrapper
registers the function with `bloc-runtime.js`; authored code never calls
`customElements.define()`. Behavior mounts on the real native `cms-bloc` root
and must return cleanup for listeners or observers. Shadow DOM APIs and direct
Location mutation are rejected.

## Page Boundary

An empty Page is empty. Every non-empty Page root must carry `cms-bloc` and
reference an active installed Bloc. Native children are admitted only through
that Bloc's `content` or named-slot contract. Slot acceptance, cardinality,
native attributes, accessibility, bindings, links and transitive Bloc
references are checked for collection Pages, defaults, Page writes,
publication and migrations.

`any-component` accepts retained Blocs, not compositions. Bounded native text
uses `plain-text` or `native-content` with the `inline` or `prose` profile.
Media remains a dedicated Bloc with a managed native media element.

## Build And Validation

```bash
bun run ulvia -- release packages/official-repository/collections/ulvia-official
bun run build
bun run verify
```

The build validates source shape, CSS scope safety, Light DOM, settings,
runtime imports and behavior patterns. Admission then validates the complete
collection graph and immutable release digest.

See [collections](collections.md), [bindings](data-bindings.md),
[theming](theming.md) and [validation](validation.md).
