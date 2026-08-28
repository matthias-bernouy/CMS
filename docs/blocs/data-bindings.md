# Bind Data And Sources

Use declarative bindings for CMS and integration data. They let Control keep
authoring markup inert, let Delivery preflight Source access, and give both
surfaces the same loading, error, repetition, and interpolation behavior.

Do not replace this contract with an ad-hoc `fetch()` in `Bloc.ts`.

## Binding Scope

Bindings activate below one `<cms-binding-core>`. The page shell
normally owns that element; an individual Bloc uses binding attributes inside
the existing scope. Adding a core around every Bloc creates isolated nested
scopes and prevents outer data from flowing into them.

The following is suitable for a Bloc's `default.html` when the page already
provides the core:

```html
<site-product-list cms-source="/.cms/sources/catalog/listProducts as catalogue">
  <p cms-condition="$source.loading">Loading products…</p>
  <p role="alert" cms-condition="$source.error">Products could not be loaded.</p>
  <p cms-condition="$source.empty">No products are available.</p>

  <ul cms-condition="$source.loaded">
    <li cms-repeat="catalogue.items as product">
      <a href="/products/{{ product.slug }}">{{ product.name }}</a>
    </li>
  </ul>
</site-product-list>
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

Delay a mutation until its owning form is submitted:

```html
<form
  cms-source="/.cms/sources/newsletter/subscribe as subscription"
  cms-source-method="POST"
  cms-source-trigger="submit"
>
  <label>
    Email
    <input name="email" type="email" required>
  </label>
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

## Editor Integration

Use an `endpoint-picker` setting when a site author may choose the endpoint.
The setting writes the Source URL attribute and can coordinate a method
attribute and default body. Keep fixed integration endpoints in `default.html`
when they are part of the Bloc contract, rather than presenting a meaningless
choice. The picker type also exposes `OPTIONS`, but the binding submission
runtime does not; when the picker writes `cms-source-method`, restrict its
`methods` to the six runtime methods listed above.

`dataScopes()` advertises expression names and fields to editor tools; it does
not activate or fetch a Source. The saved `cms-source` markup remains the
runtime authority.

## Runtime JavaScript Boundary

`Bloc.ts` may still implement local interaction: disclosure state, a carousel,
focus management, measurement, or formatting that declarative markup cannot
express. It must not bypass CMS Source authorization, embed secrets, or invent
a second data lifecycle for standard integration endpoints. If data needs
server credentials or CMS authorization, expose it as a Source endpoint first.

Bound image URLs use the same interpolation layer and have additional
network-inert activation rules. Follow
[Authoring Responsive Images](../images/authoring.md) instead of building a
custom fetch-and-Blob loader.

The complete activation element and preview-state contract is recorded in the
[`cms-binding-core` contract](../../packages/features/cms-content/src/interfaces/Editor/README.md).
