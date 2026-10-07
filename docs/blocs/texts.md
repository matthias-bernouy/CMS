# Server-rendered Collection Texts

Collection releases declare optional `texts`: JSON data included in validation
and the immutable release digest. The official catalogue examples live under
[`texts/`](../../packages/official-repository/collections/ulvia-official/texts/).

```json
{
  "id": "checkout-title",
  "values": { "en": "Checkout", "fr": "Paiement" }
}
```

## Authored source layout

The local release source separates text definitions from localized content:

```text
texts/
├── definitions/
│   ├── storefront/welcome.json
│   └── support/faq.json
└── locales/
    ├── en/storefront/welcome.json
    ├── en/support/faq.json
    └── fr/storefront/welcome.json
```

Definition fragments are arrays containing `id` and optional administration
metadata keys, without `values`. Locale fragments are objects from text ID to
static content value. Both trees are scanned recursively. Paths organize the
source but never prefix or otherwise change text IDs. Duplicate definitions,
duplicate values within one locale and values for unknown IDs reject. The CLI
assembles these fragments into the canonical release records shown above, so
site overrides and repository transport do not depend on the source layout.

## Server ownership

`@bernouy/cms-repository/collections/texts` provides pure parsing and locale
resolution. `@bernouy/cms-content/rendering` provides the shared
server DOM pass `renderCollectionTexts(root, locale, sources)`. Delivery runs
this pass after composition expansion, before serializing and caching HTML.
The same helper renders installed Control Pages.

Templates reserve the `cms` root for server-owned expressions:

```html
<h2>{{ cms.i18n.checkout.title }}</h2>
<p>{{ cms.i18n.checkout.greeting }} {{ order.total }}</p>
<input placeholder="{{ cms.i18n.checkout.placeholder }}">
```

A bounded expression scanner accepts exactly `cms.i18n.<collection>.<text>`.
Filters, calls, bracket access and other `cms` paths are rejected. Collection
and text IDs are lowercase names with optional hyphens. Expressions outside the
reserved root remain unchanged, including in the same text node or attribute.

Collection text values are intentionally static strings. They do not accept
parameters, plural objects or braces. Dynamic names, counts, dates, prices and
other request data belong to the bloc data-rendering model, not to the collection
text catalogue. They remain ordinary business expressions outside the reserved
`cms` root until that model defines translated dynamic sentences explicitly.

Collection admission rejects hardcoded user-facing copy in Bloc defaults,
fixed Light DOM and Page documents. Text nodes and user-facing attributes such
as `title`, `placeholder`, `alt`, `label` and accessible labels must consist only
of business-data bindings or exact `cms.i18n` bindings. Even punctuation between
bindings belongs in a translated value when it affects the rendered sentence.
Technical attributes such as IDs, roles, routes, field names and enumerated
control values remain literal.

The browser receives final translations, without catalogues or an i18n filter.
Source and repeat aliases cannot be named `cms`; scope lookup cannot resolve
that root from provider values or parent frames. Nested business fields such
as `order.cms` remain ordinary data and render independently. Collection text
substitution never reads them.

Each render receives explicit collection sources with `collection` and optional
`overrides`. There is no global current language or catalogue.
For each key, resolution checks the requested locale, regional parents and the
collection default. Overrides win within the same locale. Every definition
requires the default-language value.

## HTML safety and limits

Server expressions are allowed in text nodes and these attributes: `title`,
`placeholder`, `alt`, `aria-label` and `aria-description`. DOM text/attribute
assignment preserves children and escapes values during HTML serialization.
Script/style/raw-text targets and inert templates are unsupported. Unknown
keys, duplicate collection IDs and malformed reserved expressions fail rendering.
Values containing braces are rejected so a collection text cannot construct a
browser expression, including across replacement boundaries.

The catalogue permits at most 256 definitions and 32 locales per definition.
Messages have at most 8192 UTF-16 code units; release-wide bounds also apply.
IDs are lowercase names without dots. Unknown fields, duplicate IDs/locales,
object values and dynamic text syntax reject. This is a static plain-text format,
not HTML or an ICU message grammar.

## Installed catalogues and editing

The runtime persists immutable collection releases and revisioned site installations
in MongoDB. `createContentReader` exposes installed public text catalogues with
site overrides and a collection revision. Delivery loads them on render, includes
the revision in its page-cache keys and requests HTTP revalidation. Control
invalidates cached pages after saving translations. The static
`DeliveryCmsConfig.collectionTexts` option remains available for readers without
an installed-catalogue implementation.

The official Settings Control Page includes a working Texts editor: category sections contain
groups, each displaying a table with Key, Label, immutable default-language value
and editable selected-language value. Every definition must declare `category`,
`group` and `label`; `description` is optional. These fields are keys in the
collection's immutable administration catalogue assembled recursively from
`translations/<locale>/**/*.json`. Collection admission requires all three
navigation keys and verifies them against the default-locale catalogue, so an
unclassifiable text cannot be released. Navigation keeps unsaved edits;
language changes require saving
first. Reset removes the site override after Save. Concurrent stale writes return
409 and require reloading; they never overwrite newer translations.

Resolved `category`, `group` and `label` values accept nonblank strings up to 120
characters; `description` accepts up to 500. Metadata translations are not site
overrides and may be reused by other resources. IDs and server expression syntax
remain unchanged. The selector includes collection locales and configured site
languages. Complete site-language removal/migration workflows are not implemented.

## Examples and limits

`packages/official-repository/collections/ulvia-official/texts/` contains the installable Ulvia Official
catalogue, split recursively by definition, locale, domain and group. It also
serves as the reference release for validating text metadata independently from
page-owned Bloc slot content. Ulvia Official ships complete English and French
catalogues: its source-quality test requires identical administration keys in
both locales and a nonblank `en` and `fr` value for every text definition.
The checkout example remains an admission fixture. The temporary preview route
has been removed. Existing private/code collections retain the earlier Texts
mockup; only installed immutable releases have persisted translation editing.
