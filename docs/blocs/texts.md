# Server-rendered Collection Texts

Collection releases declare optional `texts`: JSON data included in validation
and the immutable release digest. The example catalogue is
[`texts.json`](../../packages/resources/collection-examples/src/texts.json).

```json
{
  "id": "greeting",
  "parameters": { "name": "string" },
  "values": { "en": "Hello {name}", "fr": "Bonjour {name}" }
}
```

## Server ownership

`@bernouy/cms-repository/collections/texts` provides pure parsing, locale
resolution and formatting. `@bernouy/cms-content/rendering` provides the shared
server DOM pass `renderCollectionTexts(root, locale, sources)`. Delivery runs
this pass after composition expansion, before serializing and caching HTML.
The same helper is available to Control for future workspace views.

Templates reserve the `cms` root for server-owned expressions:

```html
<h2>{{ cms.i18n.checkout.title }}</h2>
<p>{{ cms.i18n.checkout.greeting }}: {{ order.total }}</p>
<input placeholder="{{ cms.i18n.checkout.placeholder }}">
```

A bounded expression scanner accepts exactly `cms.i18n.<collection>.<text>`.
Filters, calls, bracket access and other `cms` paths are rejected. Collection
and text IDs are lowercase names with optional hyphens. Expressions outside the
reserved root remain unchanged, including in the same text node or attribute.
The server substitutes parameters from the render context; browser data paths
cannot supply i18n arguments. Plural selection remains server-side.

The browser receives final translations, without catalogues or an i18n filter.
Source and repeat aliases cannot be named `cms`; scope lookup cannot resolve
that root from provider values or parent frames. Nested business fields such
as `order.cms` remain ordinary data. Changing data affecting a translated
sentence requires a new server render in this slice.

Each render receives explicit collection sources with `collection`, optional
`overrides` and `parameters`. There is no global current language or catalogue.
For each key, resolution checks the requested locale, regional parents and the
collection default. Overrides win within the same locale. Every definition
requires the default-language value. Plurals use the resolved message's locale
and `Intl.PluralRules`; a plural selector must name a declared number parameter,
and every locale must provide an `other` form.

## HTML safety and limits

Server expressions are allowed in text nodes and these attributes: `title`,
`placeholder`, `alt`, `aria-label` and `aria-description`. DOM text/attribute
assignment preserves children and escapes values during HTML serialization.
Script/style/raw-text targets and inert templates are unsupported. Unknown
keys, duplicate collection IDs and malformed reserved expressions fail rendering.
Resolved values containing braces are rejected so interpolation cannot construct
new browser expressions, including across replacement boundaries. Invalid
runtime parameter types produce a visible `[collection:key]` marker.

The catalogue permits at most 256 definitions, 32 locales per definition and
16 typed parameters. Messages have at most 8192 UTF-16 code units; release-wide
bounds also apply. IDs are lowercase names without dots. Unknown fields,
duplicate IDs/locales, undeclared parameters and malformed plurals reject.
This is a plain-text format, not HTML or the full ICU message grammar.

## Delivery configuration

`DeliveryCmsConfig.collectionTexts` supplies trusted public collection sources
for the lifetime of a Delivery instance. The route language selects translations.
These inputs must be stable and public: do not put actor-specific values into
cached pages. Recreate the instance and invalidate its page cache when changing
catalogues or overrides. Automatic loading from installed collections and
revision-based cache invalidation are not implemented yet.

## Example and remaining work

`@bernouy/collection-examples` retains the declarative checkout fixture (JSON
catalogue and HTML composition), covered by an admission test. It mounts no
route or UI. The temporary Control preview page and endpoint have been removed.
The Collections Texts tab remains the existing UI mockup; translation persistence
and actual collection catalogue editing are not connected yet.

Site override persistence, site-language lifecycle and automatic installed
catalogue loading remain future work.
