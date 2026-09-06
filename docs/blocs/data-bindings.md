# Bind Data And Sources

Use declarative bindings for CMS and integration data. They let Control keep
authoring markup inert, let Delivery preflight Source access, and give both
surfaces the same loading, error, repetition, and interpolation behavior.

Do not replace this contract with an ad-hoc `fetch()` when a binding expresses
the same read or form-submission lifecycle.

## Binding Scope

Bindings activate below one `<cms-binding-core>`. The page shell
normally owns that element; an individual Bloc uses binding attributes inside
the existing scope. Adding a core around every Bloc creates isolated nested
scopes and prevents outer data from flowing into them.

The following is suitable for a Bloc's `default.html` when the page already
provides the core:

```html
<example-product-list cms-source="/.cms/sources/catalog/listProducts as catalogue">
  <p cms-condition="$source.loading">Loading products…</p>
  <p role="alert" cms-condition="$source.error">Products could not be loaded.</p>
  <p cms-condition="$source.empty">No products are available.</p>

  <ul cms-condition="$source.loaded">
    <li cms-repeat="catalogue.items as product">
      <a href="/products/{{ product.slug }}">{{ product.name }}</a>
    </li>
  </ul>
</example-product-list>
```

The core provides:

- `cms-source="URL as alias"` for a source scope;
- `{{ expression }}` in text and attributes;
- `cms-repeat="path as item"` for repeated elements;
- `cms-repeat="$range(5) as index"` for a fixed zero-based range;
- `cms-condition="expression"` for conditional elements;
- `$source.loading`, `$source.loaded`, `$source.empty`, and `$source.error` for
  the nearest source state.

A fixed range requires an alias and accepts an integer from `0` through `100`.
The alias receives `0` through `n - 1`; a range of `0` renders no instances.
Use this for a bounded number of identical placeholders or decorative items,
not to materialize independently editable Bloc copies.

Use `cms-source-id` and `$sources.<id>.<state>` when one element must observe a
specific source among several ancestors.

## Forms

The form container is native HTML owned by the CMS editor. A collection may
provide visual controls, but it must not publish a form renderer or replace the
native `form` editor. Bind the native element to a declared Source endpoint and
delay the mutation until submission:

```html
<form
  cms-source="/.cms/sources/newsletter/setSubscription as subscription"
  cms-source-body='{"subscribed":{"from":"raw","value":true}}'
  cms-source-method="POST"
  cms-source-trigger="submit"
>
  <mossa-input name="email" type="email" label="Email" required></mossa-input>
  <button type="submit">Subscribe</button>
  <p role="status" cms-condition="$source.loading">Subscribing…</p>
  <p role="alert" cms-condition="$source.error">Subscription failed.</p>
  <p cms-condition="$source.loaded">Subscription confirmed.</p>
</form>
```

`auto` is the default trigger; `submit` and `change` bind to the owning form.
Supported Source methods are `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, and
`HEAD`. Let the endpoint contract and editor source picker produce advanced
body mappings instead of hand-authoring opaque JSON where possible.

The global `cms-source:reload` event refreshes automatic Sources only; it does
not submit forms. `cms-reload-on="event-name"` opts a Source into an explicit
reload channel, including when its trigger is `submit` or `change`.

The native form editor offers a required endpoint picker, `GET`, `POST`, `PUT`,
`PATCH`, and `DELETE`, an internal-page redirect, reset-on-success, and
autocomplete. It never exposes `action`, `onsubmit`, or arbitrary attributes.
Its default content already carries `cms-source-trigger="submit"`.

Normal named controls serialize to query parameters for `GET`/`HEAD` and JSON
for other methods. Bracket names create nested objects, so a control named
`answers[email]` produces `{ "answers": { "email": "..." } }`. Files switch
body methods to `FormData`. Use the shared success and failure states instead
of a source-specific renderer. The Forms Source accepts this generic binding at
`/.cms/sources/forms/submitPublic?key=<form-key>`; the same native mechanism can
target any compatible declared endpoint.

## Editor Integration

Use an `endpoint-picker` setting when a site author may choose the endpoint.
The setting writes the Source URL attribute and can coordinate a method
attribute and default body. Keep fixed integration endpoints in `default.html`
when they are part of the Bloc contract, rather than presenting a meaningless
choice. The picker type also exposes `OPTIONS`, but the binding submission
runtime does not; when the picker writes `cms-source-method`, restrict its
`methods` to the six runtime methods listed above.

For Mossa, every fixed Source access in a Bloc view or binding must correlate
with that resource's `endpoints` declaration: Source kind and version, endpoint
URN and contract range, plus the input/output/error bindings it consumes. The
audit checks this correlation. An installed Source is not blanket permission to
invent another endpoint, and endpoint access control still applies to each
runtime request.

`dataScopes()` advertises expression names and fields to editor tools; it does
not activate or fetch a Source. The saved `cms-source` markup remains the
runtime authority.

## Runtime JavaScript Boundary

`Bloc.ts` may still implement local interaction such as disclosure state, focus
management, measurement, or formatting. It may call a CMS Source imperatively
for a multi-step workflow that bindings cannot express. That access must still
use a declared endpoint, preserve Source authorization, expose deterministic
loading/error behavior, and never embed a secret or call a provider directly.

The current Mossa audit rejects a view or binding access that cannot be
correlated to its resource declaration. It also rejects runtime/editor knobs
that alter a Source prefix, endpoint name, or function ID. The sole installation
alias currently retained is Mondial Relay's `source-id`; it is a validated,
encoded single path segment and does not choose the endpoint itself. This is a
Mossa release constraint, not yet a typed client guarantee for every collection.

Bound image URLs use the same interpolation layer and have additional
network-inert activation rules. Follow
[Authoring Responsive Images](../images/authoring.md) instead of building a
custom fetch-and-Blob loader.

The complete activation element and preview-state contract is recorded in the
[`cms-binding-core` contract](../../packages/features/cms-content/src/interfaces/Editor/README.md).
