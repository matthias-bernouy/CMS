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
  <p cms-condition="products.activity === 'fetching'">Loading products…</p>
  <section cms-match="products.outcome.kind">
    <div cms-case="'none'"></div>
    <ul cms-case="'success'">
      <li cms-repeat="products.data.items as product">
        <span>{{ product.name }}</span>
      </li>
    </ul>
    <div cms-case="'error'" cms-match="products.outcome.code">
      <p role="alert" cms-case="'CATALOG_UNAVAILABLE'">The catalog is unavailable.</p>
    </div>
    <p role="alert" cms-case="'failure'">The request could not be completed.</p>
  </section>
</section>
```

The alias owns a complete typed state:

- `activity` is `idle`, `waiting`, or `fetching`;
- `hasData` states whether a successful result is retained;
- `data` contains that successful capability output;
- `input` contains the resolved logical input when one was supplied;
- `outcome.kind` is `none`, `success`, `error`, or `failure`;
- a declared provider error exposes its contract `code`, typed `output`,
  `retryable`, HTTP `status`, and optional `requestId`;
- a transport or protocol `failure` exposes a runtime code and never pretends
  to be a provider-declared error.

Contract-aware validation requires every declared outcome and error code to be
handled with `cms-match`/`cms-case`. Capability output is accessible only in a
proven `success` branch. Arrays additionally require a length proof before
indexed access.

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
  cms-query-listen="@param:shop-category @page:shop-product-mutation/lastSuccess/requestId"
>…</section>
```

A listener does not have to be an input. This permits an explicit revision or
invalidation state to refresh a query without changing its logical input.
Appending a slash-delimited path listens only to that JSON projection. Changes
elsewhere in the state do not rerun the query. Projected paths are validated
against the collection's declared state schema.
Conversely, a required input that is initially absent stays in `waiting` until
an explicit listener or refresh policy triggers the query.
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

One rendering boundary can import several synchronized query snapshots without
starting additional requests:

```html
<section
  cms-queries="@page:shop-products as products @session:shop-user as user"
>
  <span>{{ user.data.name }}</span>
  <span>{{ products.data.items.length }} products</span>
</section>
```

`cms-queries` accepts one to sixteen unique `@scope:key as alias` imports. It
may coexist with one primary `cms-query`; the primary query and every imported
alias then share one renderer. Query input, listeners, refresh policies,
publication through `cms-sync` still belongs only to the primary query. An
imports-only boundary never performs HTTP or publishes a composite state.

Both query attributes define a rendering boundary. They are therefore invalid
on HTML void elements and on the CMS-managed atomic `svg` element. Put the
query on a containing element and bind its result into the nested media or form
control instead.

Local state queries cannot declare remote input or refresh policies and cannot
republish the state they consume.

State keys in a collection are namespaced by its collection ID. For example,
state `category` declared by `shop` is addressed as `shop-category`. Collection
admission rejects writes to undeclared or foreign states. Reading another
collection's state requires that state to be explicitly exported, imported,
and generation-pinned by the collection dependency.

## Forms and mutations

`cms-mutation` binds a native form to one provider-neutral command capability.
The author declares no URL, HTTP method, trigger, or serialization mode. The
Kernel and the admitted contract own transport; native form submission owns
activation. Named controls and optional `cms-mutation-input` descriptors form
the logical input.

```html
<section
  cms-query="newsletter:subscriptions.list as subscriptions"
  cms-query-listen="@page:newsletter-form/lastSuccess/requestId"
>…</section>

<form
  cms-mutation="newsletter:subscriptions.create as result"
  cms-mutation-reset="true"
  cms-sync="@page:newsletter-form"
>
  <input name="email" type="email" required>
  <input name="returnTo" type="hidden" value="{{ page.path }}">
  <button type="submit" disabled="{{ result.activity === 'submitting' }}">Subscribe</button>
  <section cms-match="result.outcome.kind">
    <div cms-case="'none'"></div>
    <p role="status" cms-case="'success'">Subscription confirmed.</p>
    <div cms-case="'error'" cms-match="result.outcome.code">
      <p role="alert" cms-case="'ALREADY_SUBSCRIBED'">This address is already subscribed.</p>
    </div>
    <p role="alert" cms-case="'failure'">Subscription could not be completed.</p>
  </section>
</form>
```

Mutations always use the admitted command transport and are submitted as a
logical typed input. Bracketed field names create nested objects and arrays.
`cms-form-value-type` and `cms-form-empty` provide explicit scalar and
empty-value conventions.

`cms-mutation-input` accepts the same `literal` and `state` descriptors as
query input. It supplements named controls and cannot override them. A form
cannot submit while a required state input is absent. Binary values come from
native file controls and switch the request to `FormData`; the selected
capability must admit that transport.

Query refreshes use synchronized state rather than query aliases. A form
publishes a new `lastSuccess` containing `requestId`, `status`, and `data` only
after a successful command. Listening to `lastSuccess/requestId` therefore
ignores input edits, submission activity, and failed attempts. The mutation
result is never silently merged into query data.

`cms-mutation-reset` controls native form reset. `cms-mutation-redirect` and
`cms-mutation-redirect-param` permit same-origin success navigation. The browser
automatically reuses one opaque attempt key while retrying an unchanged
submission. The Gateway forwards it only when the admitted command declares
keyed idempotency; natural and non-idempotent commands ignore it.

Like queries, mutations expose `activity`, retained `data`, resolved `input`,
and the exhaustive `outcome` union. Provider errors remain distinct from
transport/protocol failures and are checked against the selected contract.

When a form also declares `cms-sync`, it publishes its lifecycle, current
serialized `input`, successful result `data`, `lastSuccess`, and `dirty` flag.
URL parameter state is forbidden because this is structured state.

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

Attributes on a `cms-bloc` root must correspond to declared Bloc settings,
admitted native root attributes or platform binding attributes. Their types,
native booleans, ARIA values and dynamic URL destinations are checked when a
Page or Bloc is validated, before the browser runtime sees them.

All rendered structure is Light DOM. Visible and crawlable content, bindings,
conditions and repetitions remain present without a Shadow Root.

## JavaScript boundary

Bloc JavaScript remains appropriate for behavior that declarative HTML cannot
express: focus management, measurement, drag-and-drop, canvas integration, or a
genuinely multi-step interaction. It must not reconstruct a declarative data
view, duplicate query state, embed credentials, or call a provider directly.

Collection settings declare provider-neutral capability requirements. The
Kernel resolves installed providers, authorization, and transport. Binding
syntax is exported by `@bernouy/cms-content/bindings`; the live runtime is
exported by `@bernouy/cms-content/browser`.
