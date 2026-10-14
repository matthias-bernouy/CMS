# Declarative Data Bindings

Pages and Blocs use one declarative binding runtime for queries, forms,
rendering, and shared browser state. Prefer this contract to an ad-hoc
`fetch()` or DOM renderer whenever it can express the interaction.

Bindings activate below one `<cms-binding-core>`. The Page shell normally owns
that element. A Bloc contributes Light DOM inside the existing scope; it does
not create a private core.

## Queries

`cms-query` identifies a provider-neutral contract capability and requires a
unique local alias:

```html
<section
  cms-query="catalog:products.list as products"
  cms-query-input='{"category":{"from":"state","key":"@param:shop-category"},"limit":{"from":"literal","value":20}}'
  cms-query-listen="@param:shop-category"
  cms-query-refresh="focus reconnect"
>
  <p cms-condition="products.loading">Loading products…</p>
  <p role="alert" cms-condition="products.error">Products could not be loaded.</p>
  <p cms-condition="products.empty">No products are available.</p>
  <ul cms-condition="products.loaded">
    <li cms-repeat="products.data.items as product">
      <a href="/products/{{ product.slug }}">{{ product.name }}</a>
    </li>
  </ul>
</section>
```

The alias owns a complete state:

- `waiting` means that at least one required synchronized input is absent;
- `loading`, `loaded`, `empty`, and `error` describe the initial request;
- `refreshing` and `refreshError` describe a refresh without hiding existing
  data;
- `data` contains the successful capability output;
- `input` contains the resolved logical input when one was supplied;
- `status` and `message` describe a failure when available.

`cms-query-input` is a JSON object. Every field is either a JSON literal or a
reference to synchronized state:

```json
{
  "limit": { "from": "literal", "value": 20 },
  "category": { "from": "state", "key": "@param:shop-category" }
}
```

A state input is required by default. The query remains in `waiting` without
sending a request until the value exists. Use `optional: true` to omit an absent
field, or `fallback` to supply a JSON fallback; those two options are mutually
exclusive. `path` selects a nested object property or array item, and `cast`
may be `string`, `number`, `integer`, or `boolean`:

```json
{
  "page": {
    "from": "state",
    "key": "@page:shop-filters",
    "path": ["pagination", "page"],
    "cast": "integer",
    "fallback": "1"
  },
  "search": {
    "from": "state",
    "key": "@param:shop-search",
    "optional": true
  }
}
```

Collection admission validates known state paths, cast compatibility and
fallbacks against declared state schemas. Invalid or unknown descriptors are
rejected rather than silently ignored.

A query without input uses an HTTP `GET`. A query with input uses an HTTP
`QUERY` request with a bounded JSON body. The binding describes a logical
capability, not a gateway URL; the Kernel owns the transport route and provider
selection.

State inputs are snapshots. They do not implicitly subscribe the query to every
state they read. `cms-query-listen` explicitly lists the synchronized states
whose changes invalidate and rerun the query:

```html
<section
  cms-query="catalog:products.list as products"
  cms-query-input='{"category":{"from":"state","key":"@param:shop-category"}}'
  cms-query-listen="@param:shop-category @page:shop-products-revision"
>…</section>
```

A listener does not have to be an input. This permits an explicit revision or
invalidation state to refresh a query without changing its logical input.
Conversely, a required input that is initially absent stays in `waiting` until
an explicit listener, refresh policy, or targeted reload triggers the query.
`cms-query-refresh` may additionally contain `focus`, `reconnect`, and one
bounded interval such as `interval(5s)`. These policies do not change the
capability or its input.

## Synchronized state

`cms-sync` connects a producer or form control to a named state:

```html
<input type="search" cms-sync="@param:shop-category">
```

The four scopes have distinct lifetimes:

| Scope | Lifetime and storage |
|---|---|
| `@param:key` | Current URL query parameter; nonnullable strings only. |
| `@page:key` | Current document lifetime; structured JSON values are allowed. |
| `@session:key` | Browser tab session storage; structured, versioned JSON. |
| `@persistent:key` | Browser local storage; structured, versioned JSON. |

Native `input`, `select`, and `textarea` elements synchronize their live value
in both directions. Checkboxes publish booleans. A form-associated custom
element uses the same `value` contract after its definition is registered.
File inputs are submitted by their form and are not state controls.
Native multiple selects also stay form-owned until the binding contract defines
explicit array semantics.

A remote query can publish its complete lifecycle snapshot:

```html
<section
  cms-query="catalog:products.list as products"
  cms-sync="@page:shop-products"
>…</section>
```

Another binding can consume that snapshot without another HTTP request:

```html
<aside cms-query="@page:shop-products as products">
  <span>{{ products.data.items.length }}</span>
</aside>
```

Local state queries cannot declare remote input or refresh policies and cannot
republish the state they consume.

State keys in a collection are namespaced by its collection ID. For example,
state `category` declared by `shop` is addressed as `shop-category`. Collection
admission rejects writes to undeclared or foreign states. Reading another
collection's state requires that state to be explicitly exported, imported,
and generation-pinned by the collection dependency.

## Forms and mutations

`cms-source` is reserved for native form submissions. Its URL is static and
same-site; it does not interpolate synchronized state. Named controls and an
optional `cms-source-body` provide mutation input.

```html
<form
  cms-source="/.cms/call/newsletter/subscriptions.create as result"
  cms-source-method="POST"
  cms-source-trigger="submit"
  cms-source-serialization="typed-json"
  cms-source-success-reload="subscriptions"
  cms-sync="@page:newsletter-form"
>
  <input name="email" type="email" required>
  <input name="returnTo" type="hidden" value="{{ page.path }}">
  <button type="submit" disabled="{{ $source.loading }}">Subscribe</button>
  <p role="status" cms-condition="$source.loaded">Subscription confirmed.</p>
  <p role="alert" cms-condition="$source.error">Subscription failed.</p>
</form>
```

The trigger is `submit` or `change`. Supported methods are `GET`, `POST`,
`PUT`, `PATCH`, and `DELETE`. Body methods normally use
`cms-source-serialization="typed-json"`; bracketed field names create nested
objects and arrays. `cms-form-value-type` and `cms-form-empty` provide explicit
scalar and empty-value conventions.

`cms-source-body` accepts the same `literal` and `state` descriptors as query
input. It supplements named controls; it is not a dynamic URL mechanism. A form
cannot submit while a required state input is absent. Binary values come from
native file controls and use `FormData` when present. Provider capabilities
currently accept bounded JSON unless their transport contract explicitly
supports binary input.

`cms-source-success-reload` contains one to eight query aliases. After a
successful mutation, only those live queries are refreshed. The mutation result
is never silently merged into query data. `cms-source-success-reset`, internal
redirect attributes, publication events, and automatic idempotency retain their
bounded form semantics.

When a form also declares `cms-sync`, it publishes its lifecycle, current
serialized `input`, successful result `data`, and `dirty` flag. URL parameter
state is forbidden because this is structured state.

## Rendering

Bindings use ordinary authored Light DOM:

- `{{ expression }}` interpolates text and attributes;
- `cms-repeat="path as item"` repeats an element over data;
- `cms-repeat="$range(5) as index"` creates a bounded fixed range;
- `cms-condition="expression"` controls element presence.

Exact attribute interpolation preserves the evaluated type. Known HTML boolean
attributes such as `checked`, `disabled`, `required`, and `selected` are present
only for the boolean value `true`. ARIA boolean values become the strings
`"true"` and `"false"`. The `string` filter explicitly converts safe scalar
values and rejects objects and arrays.

Custom-element attributes must correspond to declared Bloc settings. Their
types, native boolean attributes, ARIA attributes, and dynamic URL destinations
are checked when a Page or Bloc is validated, before the browser runtime sees
them.

Shadow DOM contains only a component's internal structure and styles. Visible
and crawlable content, bindings, conditions, and repetitions stay in Light DOM.

## JavaScript boundary

Bloc JavaScript remains appropriate for behavior that declarative HTML cannot
express: focus management, measurement, drag-and-drop, canvas integration, or a
genuinely multi-step interaction. It must not reconstruct a declarative data
view, duplicate query state, embed credentials, or call a provider directly.

Collection settings declare provider-neutral capability requirements. The
Kernel resolves installed providers, authorization, and transport. Binding
syntax is exported by `@bernouy/cms-content/bindings`; the live runtime is
exported by `@bernouy/cms-content/browser`.
