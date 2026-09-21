# CmsCore Site References

These directories retain declarative site snapshots for migration and visual
comparison. They are not templates and no longer have a supported repository
push workflow. New sites are initialized and edited directly through the CMS.

## Sites

- `restaurant-demo` is a self-contained visual preview of the three
  `restaurant` hero layouts and their shared configurable header.

## Migration Status

Existing `p9r.config.json`, `.p9r-state.json`, and `site/` trees are historical
inputs only. Do not use them to start a new site. A migration or onboarding
flow may read their data explicitly, but the removed legacy CLI no longer
publishes these directories.

New reusable Blocs belong to a collection; global colors, type, and spacing
come from the CMS structured theme.
