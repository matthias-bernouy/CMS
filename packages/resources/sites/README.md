# CmsCore Site References

These directories retain declarative site snapshots for migration and visual
comparison. They are not templates and no longer have a supported repository
push workflow. New sites are initialized and edited directly through the CMS.

## Sites

- `cms-repository-hub` is the CMS-authored public catalogue for the external
  global integration repository. A designated CMS renders the site, reads the
  anonymous same-origin repository facade, and keeps all browser state in query
  parameters; it does not manage repository mutations.
- `restaurant-demo` is a self-contained visual preview of the three
  `restaurant` hero layouts and their shared configurable header.

## Migration Status

Existing `p9r.config.json`, `.p9r-state.json`, and `site/` trees are historical
inputs only. Do not use them to start a new site. A migration or onboarding
flow may read their data explicitly, but the removed legacy CLI no longer
publishes these directories.

The repository hub snapshot still documents the intended catalogue experience,
but deploying that experience now requires CMS-managed onboarding or an
explicit migration. The runtime does not silently import this directory.

The repository hub pins the existing `basic-blocs@1.0.0` and
`documentation-blocs@1.0.0` integrations. Its catalogue endpoint is provided
by the repository surface, not by a site-specific integration.

Repository-specific presentation in `site/blocs/Repository/` is also retained
only as migration reference. New reusable Blocs belong to a collection
integration; global colors, type, and spacing come from the CMS structured
theme.
