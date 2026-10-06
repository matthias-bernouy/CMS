# Official Repository

This directory is the authored source of official immutable releases published
to CMS repositories. It contains provider-neutral contracts, provider manifests
and collections. Admission, canonicalization, storage and installation belong
to `@bernouy/cms-repository`; this directory only owns the official publications.
The separate `@bernouy/official-repository-server` runtime never scans this
directory; the release pipeline pushes reviewed exact coordinates into its
persistent store.

The official `ulvia.cms.*` contracts are served by the `@bernouy/cms-core`
surface after admission. Generic protocol fixtures remain beside the
`cms-repository` tests and must not be moved here. `catalog.items`,
`forms.submissions` and `media.assets` are no longer published demo contracts.

A contract may carry an independently versioned `conformance.json` companion.
It is admitted against the exact contract digest in tests and contains only
runner-neutral capability scenarios. Conformance-suite repository coordinates
and live execution are not implemented yet; the companion must not contain an
endpoint, credential format or deployment assumption.

Official collections keep reusable administration copy in recursively scanned
`translations/<locale>/**/*.json` fragments. Resource definitions contain only
translation keys; duplicate keys across locale fragments reject, and page-owned,
site-overridable content remains in `texts/`. Theme category files may likewise
be grouped in subdirectories below `theme/` without changing their stable IDs.
Text definitions and per-locale values are separate recursive trees below
`texts/`; Bloc folders may be grouped recursively below `blocs/`. These source
paths never become release identities.

The Ulvia Official collection publishes a selective public surface: foundational
layout and content components, reusable content items, composed page sections,
and the theme tokens they consume. Compositions declare their exact local Bloc
dependencies through `uses`; selective collection dependencies may import explicitly
exported Blocs, theme tokens, server texts and immutable assets. Authored content remains page-owned through typed
slots instead of being embedded in collection settings.

Managed native components declare an accepted tag set in `nativeElement`, expose
one unnamed Shadow DOM slot, and supply one concrete native root in
`default.html`; they never add fixed `lightdom.html`. The official action accepts
`button` and `a`, while the official heading accepts `h1` through `h6`. Wrapper
settings remain separate from native child attributes.
