# Bind Data And Sources

Use declarative bindings for CMS and provider data. They let Control keep
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

Conditions can use the same registered value filters as interpolation:
`cms-condition="items | kind == 'list'"` or
`cms-condition="items | includes(selection.id)"`. The host supplies pure `kind`
and `includes` filters in these examples. A filter takes one resolved input and
optionally one argument path. It runs before comparisons and boolean operators;
`!items | includes(selection.id)` negates the filtered result. Filters are not
arbitrary JavaScript calls, and an unknown filter makes the condition invalid.
A missing scope root does not invoke the filter. A present root with a missing
property supplies `undefined`, matching interpolation's scope ownership rules.
This allows declared scalar/list branches without a component constructing DOM
from response data. It does not add general parentheses, filter chains or a
template-reference mechanism.

## Form control values

Use ordinary attribute interpolation for text values. The binding synchronizes
`value` with the live property of native inputs, selects, textareas and
form-associated custom elements. Custom controls keep their existing `value`
contract and native `ElementInternals.setFormValue()` participation. There is
no separate typed component receiver method.

```html
<input name="quantity" type="number" value="{{ item.quantity }}">
<select name="status" value="{{ item.status }}">...</select>
<input name="enabled" type="checkbox" cms-bind-boolean-checked="item.enabled">
```

Checkboxes use the existing boolean-presence binding: only boolean `true`
checks the input. Never interpolate `checked="false"`, since native HTML treats
its presence as checked. Repeated native select options are mounted before the
select value is applied. Multiple selects can bind each option's `selected`
attribute with the same boolean mechanism.

Unchanged bound values preserve local drafts, focus and selection. A changed
value updates its existing control. After a successful Save and targeted read,
submitted fields accept the read value even when the server normalized the
input back to its previous value. File inputs never receive a programmatically
assigned value. Late custom-element definitions receive the latest pending
attribute value; disposing the binding cancels that pending property update.

Use `cms-bind-boolean-invalid="directory.failed"` to bind an attribute's
presence to a scope path. Only the boolean `true` adds the named attribute;
every other value removes it. The suffix is a lowercase attribute name, and
the expression accepts a path only. This also works with native boolean
attributes such as `disabled` or `required`. Use ordinary interpolation for
string-valued attributes such as `aria-expanded`, where `"false"` is meaningful.

Both interpolated attributes and boolean attribute bindings apply only when
their evaluated result changes. Unrelated context refreshes therefore preserve
local control feedback, such as a required-field error. A changed bound result
replaces that local attribute value. Source and submit-result boundaries still
determine which scope owns a binding.

Keep bound children in light DOM under the page core. A visual component may
slot them into an encapsulated Shadow DOM shell; it must not create another
core or inject document-level CSS to compensate for hidden bindings.

## Save and targeted refresh

A form may declare `cms-source-success-reload="#detail"`. The ID must identify
one active automatic read source in the same binding core. Its URL, source
instance and selection generation are checked before applying late effects.
The mutation response is not merged into the source; a successful response,
including HTTP 204, triggers a GET of that source only.

Values are captured before editing is locked. The form and target source stay
mounted and busy until the write and requested read finish. The lock blocks
user edits and other submissions in that scope without disabling controls or
changing their layout. A form using this reload attribute does not reset by
default; an explicit `cms-source-success-reset` still takes precedence.

A same-URL read retains its loaded or empty content, sets `$source.refreshing`,
and reports `$source.refreshError` on failure. Bind retry feedback to the read
source's state, so a successful retry clears it. Initial reads and URL changes
keep the ordinary loading/error behavior. Unchanged JSON branches retain their
references; repeated entries retain nodes when unchanged at the same index.
Changed or moved entries can remount; this is not keyed reconciliation.

`reloadSource(element)` from `@bernouy/components/binding` (also the package
root) awaits one read and returns whether it succeeded. A bubbling
`cms-source:reload` dispatched on the source retries only that source. A
legacy document-dispatched event still refreshes automatic sources globally.

Successful completion events/publication/reset/navigation wait for the read.
If the mutation succeeded but the read failed, `cms-source:refresh-failed`
carries a `FormSubmitResult` with `ok: true` and `refresh.ok: false`; ordinary
success effects are not fired. Retry the read without replaying the mutation.
Mutation failures retain the draft and publish the existing failure event.

`cms-source-serialization="typed-json"` opts request-body forms into typed
serialization of their real named controls, including external `form="id"`
controls. Numbers and boolean checkboxes retain their types. Explicit
`cms-form-value-type="string|number|boolean"` and `cms-form-empty="null|omit"`
handle other scalar conventions. Bracket names build objects and indexed
arrays; terminal `[]` appends values. Duplicate/conflicting paths, unsafe keys,
sparse arrays and invalid scalar values fail before sending. Read-only,
disabled and unnamed controls are excluded; binary uploads use ordinary
multipart forms. Tokens keep their current comma-separated string contract;
ordinary commas are not interpreted as arrays. Forms without the opt-in keep
their existing serialization.

## Applying an action result to a source

Control may already have the complete resource returned by a successful action.
`setSourceData(sourceElement, value)` from `@bernouy/components` (also exported
by `@bernouy/components/binding`) supplies that value to the existing source
renderer. It cancels an older pending read and applies normal interpolation,
conditions and repetition to the source's authored template. It does not call a
widget renderer or serialize the value into an attribute.

A value supplied before source activation seeds the initial render without an
HTTP request, including an explicit null/empty value for a creation form.
Explicit reloads still fetch the configured URL. The source retains its alias,
status lifecycle and ownership under the document core. `readSourceData(element)`
reads the last supplied/fetched value for action-expression evaluation; disposing
the source clears it. Consumers must retain their operation-generation checks
so an obsolete action cannot target a newly selected resource.

This interface is intended for automatic read sources. Native form submissions
continue to use their existing result and success-event contract. It is not an
alternative HTML renderer or a reason to add hidden object-relay elements.

## Local source context

`observeSource(element, listener)` observes the lifecycle of an existing bound
source after its presentation. It returns an unsubscribe function and immediately
replays the current observation when one exists. Observations expose the source
status, `disposed`, and `data` (the last successful automatic read, also available
through `readSourceData`). Loading and errors retain that successful snapshot;
consumers must inspect status before accepting new data. Empty successful reads
have `empty: true`. Disposal clears the snapshot. Form submission results remain
in the form binding scope, not in this read-data API.

Use this hook to coordinate definition-driven composition or action completion.
It does not start requests, introduce a nested core, serialize data into attributes,
or replace declarative rendering of resource values. Unsubscribe on disconnect.

`setSourceContext(element, project)` and `refreshSourceContext(element)` are
exported by `@bernouy/components` and `@bernouy/components/binding`. They let a
source's authored conditions and interpolations depend on local editing state.
Register the projection before source activation, or replace it while active.
It returns additional scope variables; the source alias, `$source` and `$sources`
keep their normal values and cannot be replaced by this context.

The projection runs when the source body is evaluated. Its argument is the
current presentation value, which may be undefined or an error result; use
`readSourceData(element)` when a local editing model needs the last successful
read. Keep projections limited to deriving values, without HTTP requests or DOM
construction. The binding engine applies the resulting scope to the authored
HTML; no custom-element data receiver is necessary.

After changing local state, call `refreshSourceContext(element)`. It updates the
existing template without fetching, cancelling a pending request or publishing
a new source status. Ordinary condition/repeat behavior still applies. Disposal
disconnects refresh delivery; the registered projection remains attached to the
element through a weak reference for subsequent activation.

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

Form submissions include the current page's query parameters by default.
Set `cms-source-inherit-query="false"` on the form to send only the parameters
explicitly declared in its Source URL (plus form fields for `GET`/`HEAD`). This
preserves action endpoint contracts when the page URL also contains navigation
or filter parameters. The option accepts `true` or `false`; omitting it retains
the existing behavior. It does not disable explicit `#{param}` URL bindings.

The global `cms-source:reload` event refreshes automatic Sources only; it does
not submit forms. `cms-reload-on="event-name"` opts a Source into an explicit
reload channel, including when its trigger is `submit` or `change`.

The native form editor offers a required endpoint picker, `GET`, `POST`, `PUT`,
`PATCH`, and `DELETE`, page-query inheritance, an internal-page redirect,
reset-on-success, and autocomplete. It never exposes `action`, `onsubmit`, or arbitrary attributes.
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
attribute and default body. Keep fixed Source endpoints in `default.html`
when they are part of the Bloc contract, rather than presenting a meaningless
choice. The picker type also exposes `OPTIONS`, but the binding submission
runtime does not; when the picker writes `cms-source-method`, restrict its
`methods` to the six runtime methods listed above.

`dataScopes()` advertises expression names and fields to editor tools; it does
not activate or fetch a Source. The saved `cms-source` markup remains the
runtime authority.

## Runtime JavaScript Boundary

`Bloc.ts` may still implement local interaction such as disclosure state, focus
management, measurement, or formatting. It may call a CMS Source imperatively
for a multi-step workflow that bindings cannot express. That access must still
use a declared endpoint, preserve Source authorization, expose deterministic
loading/error behavior, and never embed a secret or call a provider directly.

Bound image URLs use the same interpolation layer and have additional
network-inert activation rules. Follow
[Authoring Responsive Images](../images/authoring.md) instead of building a
custom fetch-and-Blob loader.

The complete activation element and preview-state contract is recorded in the
[`cms-binding-core` contract](../../packages/features/cms-content/src/interfaces/Editor/README.md).
