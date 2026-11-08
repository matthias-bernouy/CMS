# Server-rendered Collection Texts

Immutable collection releases contain text definitions and localized values.
Definitions, locale values and their metadata participate in the release digest;
site overrides live separately and do not change that release.

## Authored Sources

```text
texts/
├── definitions/storefront/welcome.json
└── locales/
    ├── en/storefront/welcome.json
    └── fr/storefront/welcome.json
```

Definition fragments are arrays with local `id`, `category`, `group`, `label`
and optional `description`. Navigation fields reference administration translations
under `translations/<locale>/**/*.json`. Locale fragments map text IDs to strings.
Recursive paths organize sources without changing IDs. Duplicate definitions,
duplicate locale values and values for unknown IDs refuse preparation.

The compiler assembles canonical records with `id`, metadata and `values`.
Each text needs its default-locale value. Category/group/label translations
accept nonblank strings up to 120 characters; descriptions accept up to 500.

## Rendering

For collection `example/shop`, these are text fragments inside owned Bloc content:

```html
<h2>{{ cms.i18n.example/shop.checkout-title }}</h2>
<p>{{ cms.i18n.example/shop.checkout-greeting }} {{ order.total }}</p>
<input placeholder="{{ cms.i18n.example/shop.checkout-placeholder }}">
```

The reserved syntax is `cms.i18n.<namespace/name>.<local-text-id>`. Collection
identities are qualified; local text IDs are lowercase names without dots.
Filters, calls and bracket access are refused. Ordinary business bindings remain
outside the reserved `cms` root. Texts are static strings, without parameters,
plural objects, HTML or brace expressions.

Content owns `renderContentTexts` from `@bernouy/content/rendering`. Its injected
`ContentTextSource` values contain a namespace and locale resolver. Installed
collection contributions supply those sources through the Provider's Content
composition. Edge receives the rendered native resource; it never loads text
catalogues or runs a separate substitution pass.

Resolution checks the requested locale, regional parents and collection default;
a site override wins within its locale. DOM assignment escapes values. The
supported targets are text nodes, `title`, `placeholder`, `alt`, `aria-label`
and `aria-description`; raw-text/script/style/inert-template targets refuse.
Unknown keys, duplicate namespaces and malformed reserved expressions refuse.

Collection-owned fixed copy uses declared texts or business bindings. Site-owned
Page slot copy may remain literal editorial content. An authoring client may
explicitly replace a collection text reference with Page-owned wording; insertion
and rendering do not silently make that change.

## Site Overrides

Content capabilities `localization.texts.get` and `localization.text.save`
read installed collection catalogues and set or clear one locale override.
Writes use the current revision; stale writes refuse instead of overwriting
newer values. The runtime injects contribution ports backed by Repository
installation state. Rendering freshness follows contribution revisions and
[Content delivery caching](../architecture/content-delivery.md).

No Settings Page or visual Texts editor is bundled. Clients can build these
interfaces through the admitted capabilities without accessing persistence.
Complete site-language removal/migration workflows are not implemented.

## Bounds

A release permits at most 4,096 texts and 32 locales per text. Values contain
at most 8,192 UTF-16 code units, with release-wide bounds as well. Unknown
fields, duplicate IDs/locales, objects and dynamic text syntax refuse admission.
See [collections](collections.md) and [validation](validation.md).
