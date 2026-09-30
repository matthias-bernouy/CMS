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

## Installed catalogues and editing

The runtime persists immutable collection releases and revisioned site installations
in MongoDB. `createContentReader` exposes installed public text catalogues with
site overrides and a collection revision. Delivery loads them on render, includes
the revision in its page-cache keys and requests HTTP revalidation. Control
invalidates cached pages after saving translations. The static
`DeliveryCmsConfig.collectionTexts` option remains available for readers without
an installed-catalogue implementation.

Installed collections have a working Texts editor: category sections contain
groups, each displaying a table with Key, Label, immutable default-language value
and editable selected-language value. Optional `category`, `group`, `label` and
`description` metadata belong to the JSON definition. Unclassified texts appear
under General / Texts. Navigation keeps unsaved edits; language changes require
saving first. Reset removes the site override after Save. Concurrent stale writes
return 409 and require reloading; they never overwrite newer translations.

`category`, `group` and `label` accept nonblank strings up to 120 characters;
`description` accepts up to 500. IDs and runtime interpolation remain unchanged.
The selector includes collection locales and configured site languages. Complete
site-language removal/migration workflows are not implemented.

## Examples and limits

`packages/resources/collections/test/texts/` contains the installable Test
catalogue, split by category. Its eight compositions use the declared keys.
The checkout example remains an admission fixture. The temporary preview route
has been removed. Existing private/code collections retain the earlier Texts
mockup; only installed immutable releases have persisted translation editing.
