# Official Repository

This directory is the authored source of official immutable releases published
to CMS repositories. It contains provider-neutral contracts, provider manifests
and collections. Admission, canonicalization, storage and installation belong
to `@bernouy/cms-repository`; this directory only owns the official publications.
The separate `@bernouy/official-repository-server` runtime never scans this
directory; the release pipeline pushes reviewed exact coordinates into its
persistent store.

The official `ulvia.cms.*` contracts are served by the `@bernouy/ulvia-provider`
surface after admission. Generic protocol fixtures remain beside the
`cms-repository` tests and must not be moved here. `catalog.items`,
`forms.submissions` and `media.assets` are no longer published demo contracts.

Contract source metadata lives in `definition.json`. Capabilities are individual
recursive `capabilities/**/*.json` fragments. Optional mocks are individual
`mocks/**/*.json` fragments carrying an explicit `capabilityId`.

Specialized contracts remain sibling directories. Their `definition.json`
pins one exact parent through `extends`, and their capability tree contains only
specialization-specific additions. Inherited capabilities resolve from the
immutable parent chain.

Conformance metadata lives in `conformance/definition.json`, with individual scenarios and
coverage exemptions below recursive `conformance/scenarios/` and
`conformance/exemptions/` trees. Source paths organize review only: assembly is
sorted by declared identities, so moving a fragment does not change the release.

The independently versioned conformance companion is admitted against the exact
compiled contract digest and contains only runner-neutral capability scenarios.
The Gateway live runner consumes that companion through an injected disposable
provider environment. Published evidence embeds the canonical suite and exact
digest; suites do not yet have an independent repository catalogue. The
companion must not contain an endpoint, credential format or deployment
assumption.

Official collections keep reusable administration copy in recursively scanned
`translations/<locale>/**/*.json` fragments. Resource definitions contain only
translation keys; duplicate keys across locale fragments reject, and page-owned,
site-overridable content remains in `texts/`. Theme category files may likewise
be grouped in subdirectories below `theme/` without changing their stable IDs.
Text definitions and per-locale values are separate recursive trees below
`texts/`; Bloc folders may be grouped recursively below `blocs/`. These source
paths never become release identities.

Collection assets are the exception: every file below `assets/` uses its
normalized lowercase relative path as its stable local ID. Assets are discovered
automatically rather than repeated in `definition.json`. The official icon
library consists of verified presentation-only SVG files and authored markup
references them through empty `svg[cms-svg]` elements; it has no icon-specific
Bloc or behavior module.

The Ulvia Official collection publishes a selective public surface: foundational
layout and content components, reusable content items, composed page sections,
and the theme tokens they consume. Compositions declare their exact local Bloc
dependencies through `uses`; selective collection dependencies may import explicitly
exported Blocs, theme tokens, server texts and immutable assets. Authored content remains page-owned through typed
slots instead of being embedded in collection settings.

Every official Bloc declares the native `root` elements that may carry its
`cms-bloc` identity. A Bloc may declare a bounded default `native-element` slot
for one Page-owned native child, for example an enriched input or select. This
uses the same slot grammar as every other Page-owned child; there is no parallel
`content` contract. All structure remains in Light DOM; styles are validated
and scoped by the release build. Optional behavior mounts on the real native
root and cannot register custom elements or create Shadow Roots.
