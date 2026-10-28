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
    "previews": [
        {
            "id": "desktop",
            "frame": { "width": 640, "height": 240 }
        },
        {
            "id": "mobile",
            "frame": { "width": 390, "height": 640 }
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
Examples reference ordinary local or explicitly imported collection texts.
An optional “Examples” category organizes those texts without changing their
behavior. Per-example `texts` overrides are unsupported.

## Single Bloc and assembled examples

An example may contain a single Bloc, a Bloc with children, or several roots
forming a section or complete demonstration page. It has no URL route and
does not install a Page.

A Bloc's `defaultExample` must be in its `examples` list and contain exactly
one root annotated with that Bloc's ID. That root may contain any valid slot
children. A multi-root example cannot be the default insertion for one Bloc.
Examples do not introduce new reusable `kind: "composition"` definitions.

The editor can reuse the default example's full root and settings. Shared text
references stay in the HTML and resolve through the normal collection text
renderer. An editor may explicitly replace a reference with literal wording
when it wants Page-owned content. There is no automatic conversion based on
a text category.
Updating an example does not rewrite already inserted Page content.

## Previews and exploration

Every example requires one to sixteen preview profiles. Each profile has a
unique ID and mandatory integer `frame.width` and `frame.height` between 1 and
4096 CSS pixels. Authored examples and preview definitions contain no `locale`
or `themeMode`. The viewport controls actual responsive layout. Captures use exactly
that viewport, not full-page expansion.

Describe interaction behavior in the Bloc or example description. Captures
show the initial state. The explorer loads the real browser behavior so users
can interact manually. Action scripts and screenshot state scenarios are not
part of this version.

From the workspace:

```bash
bun run build:browser
bunx playwright@1.63.0 install chromium
bun run ulvia -- preview /path/to/collection --output /path/to/new-output --locale fr --theme-mode dark --serve
```

Locale and theme mode are rendering options for the export, not collection
source data. `--locale` defaults to the collection's reference locale and
`--theme-mode` defaults to `light`. Export again with other options to explore
the same immutable examples in another context. The rendered frame manifest
records the effective locale and mode so each capture is reproducible.

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

Admission checks server text placement with the same rules as rendering, without
replacing the references. Text nodes and user-facing native attributes are
supported; machine/settings attributes and inert text such as textarea content
cannot contain server text references.
