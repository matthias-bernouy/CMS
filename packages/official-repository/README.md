# Official Repository

This directory is the authored source of official immutable releases published
to CMS repositories. It contains provider-neutral contracts, provider manifests
and collections. Admission, canonicalization, storage and installation belong
to `@bernouy/cms-repository`; this directory only owns the official publications.

The official Ulvia provider implementation lives separately in
`packages/official-provider`. Generic protocol fixtures remain beside the
`cms-repository` tests and must not be moved here.

Official collections keep reusable administration copy in recursively scanned
`translations/<locale>/**/*.json` fragments. Resource definitions contain only
translation keys; duplicate keys across locale fragments reject, and page-owned,
site-overridable content remains in `texts/`. Theme category files may likewise
be grouped in subdirectories below `theme/` without changing their stable IDs.
Text definitions and per-locale values are separate recursive trees below
`texts/`; Bloc folders may be grouped recursively below `blocs/`. These source
paths never become release identities.
