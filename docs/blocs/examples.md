# Collection Examples

Authored collections use `protocol: "ulvia-collection/v1"` with required catalogue
metadata and collection-owned examples. Bloc `category`, `thumbnail`,
`defaultContent`, and `default.html` are unsupported.

## Bloc metadata

Every Bloc requires translated `label`, `description` and a nonempty,
duplicate-free `categories` array of translation keys. Listed Blocs also require
an associated `defaultExample`. Hidden implementation Blocs may omit examples.
Catalogue order applies identically to each membership.

```json
{
    "label": "bloc.action.label",
    "description": "bloc.action.description",
    "categories": ["bloc.category.actions"],
    "examples": ["contact-action", "landing-page"],
    "defaultExample": "contact-action"
}
```

Example IDs are collection-local. Source grouping paths do not define identity.
An example may appear on several Bloc cards without duplicating its document.

## Source layout

```text
collection/
  definition.json
  blocs/
  examples/
    contact-action/
      definition.json
      document.html
  assets/
  translations/
```

Each example folder contains exactly those two files. Recursive grouping is
allowed. The compiler assembles them into the release's immutable `examples`
array. Duplicate IDs and unknown fields reject preparation.

Example `definition.json`:

```json
{
    "id": "contact-action",
    "label": "example.contact.label",
    "description": "example.contact.description",
    "texts": {
        "my-collection": {
            "action-label": {
                "en": "Contact us",
                "fr": "Contactez-nous"
            }
        }
    },
    "previews": [
        {
            "id": "desktop",
            "frame": { "width": 640, "height": 240 }
        },
        {
            "id": "mobile",
            "frame": { "width": 390, "height": 640 },
            "locale": "fr",
            "themeMode": "dark"
        }
    ]
}
```

The `document.html` uses the existing Page grammar:

```html
<button cms-bloc="my-collection-action" type="button" variant="filled">
    {{ cms.i18n.my-collection.action-label }}
</button>
```

Settings live on their corresponding elements; omitted settings use their
contract defaults. Editable example copy may also be literal Page content.
Labels and descriptions always reference administration translations.
Text fixtures may override only local or explicitly imported text IDs. They
are not collection configuration or site-wide text writes.

## Single Bloc and assembled examples

An example may contain a single Bloc, a Bloc with children, or several roots
forming a section or complete demonstration page. It has no URL route and
does not install a Page.

A Bloc's `defaultExample` must be in its `examples` list and contain exactly
one root annotated with that Bloc's ID. That root may contain any valid slot
children. A multi-root example cannot be the default insertion for one Bloc.
Examples do not introduce new reusable `kind: "composition"` definitions.

The editor copies the default example's full root and settings. Editable
translation markers are materialized into escaped Page-owned text using the
collection's locale. Fixed implementation copy remains collection-owned.
Demonstration overrides are never persisted into the site's text catalogue.
Updating an example does not rewrite already inserted Page content.

## Previews and exploration

Every example requires one to sixteen preview profiles. Each profile has a
unique ID and mandatory integer `frame.width` and `frame.height` between 1 and
4096 CSS pixels. Locale defaults to the collection locale; mode defaults to
`light`. The viewport controls actual responsive layout. Captures use exactly
that viewport, not full-page expansion.

Describe interaction behavior in the Bloc or example description. Captures
show the initial state. The explorer loads the real browser behavior so users
can interact manually. Action scripts and screenshot state scenarios are not
part of this version.

From the workspace:

```bash
bun run build:browser
bunx playwright@1.63.0 install chromium
bun run ulvia -- preview /path/to/collection --output /path/to/new-output --serve
```

The output directory must not exist and must be separate from authored
sources. Use `--dependency /path/to/other-collection` for each exact dependency
source, including transitive dependencies. Required capability contracts must
already be admitted in the CLI's local cache, as for `release`. Preview never
fetches a public Repository, installs a collection, or publishes artifacts.

The command writes standalone frame documents, styles, browser runtimes,
verified assets, PNG captures, a frame explorer and `manifest.json`. The
manifest records release/dependency digests, frame dimensions, browser ABI,
browser version, output-file digests and default Bloc preview mappings.
Captures are derived files and do not mutate the release.

Use `--no-screenshots` to export without launching Chromium. `--serve` starts
a read-only loopback explorer, including font CORS support for sandboxed
frames. Stop it with Ctrl+C. Frames cannot access the explorer's DOM.
Capture contexts allow only local export requests; there are no live API
fixtures for data-dependent examples.

Generated captures are not uploaded or mounted in the CMS catalogue yet.
Public preview distribution and the integrated catalogue UI remain separate
work. The editor already consumes the default insertion and all category
memberships through its existing authoring contract.

## Validation

```bash
bun test packages/features/cms-repository/tests/collections/admission/examples
ULVIA_RUN_EXAMPLE_BROWSER=1 bun test packages/runtimes/ulvia-cli/tests/preview
bun run verify:full
```
