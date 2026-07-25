# Photo Albums 1.0.0

Photo Albums stores album state and immutable accepted originals in a private
Supabase connector. Public JSON and image access goes through the installed CMS
Source; browser clients never receive Storage credentials or object paths.

The public Blocs use `publicPhoto` file URLs with intrinsic dimensions. CmsCore
adds only its finite responsive width candidates and keeps generated
derivatives in disposable runtime cache infrastructure. `@bernouy/cms-files`
continues to own site-editor media and is not a second store for album photos.
Public photo identities use `public, max-age=31536000, immutable`. Replacement
creates a different identity; cached URLs may therefore remain readable for up
to one year after an album is unpublished or a photo is detached.

Version 1.0.0 provides flat categories, ordered albums and photos, publication
status, gallery settings, three backoffice dashboards, an album list Bloc, and
an album gallery Bloc.

## Backoffice

The dashboards let editors:

- create, order, publish, archive, and categorize albums;
- upload, replace, order, and detach photos while preserving accepted
  originals;
- configure the gallery title, page size, download policy, captions, capture
  dates, and per-album photo limit.

Photo upload and replacement endpoints accept optional `alt`, `caption`, and
`takenAt` parameters. The `managePhoto` and `updatePhoto` Source endpoints make
the same metadata available to custom admin surfaces and automation without
coupling them to Supabase.

## Reusable Blocs

Both public Blocs use `cms-binding-core` for data loading, repetition,
conditions, and dynamic attributes. They never issue application-specific
`fetch` calls.

The list Bloc exposes editor settings for page size, URL synchronization,
category filtering, grid bounds and spacing, Source ID, and Source prefix. Its
named editable regions are `heading`, `loading`, `error`, `empty`, `catalogue`,
and `pagination`.

The gallery Bloc exposes editor settings for a fixed slug or URL slug
parameter, grid bounds and spacing, Source ID, and Source prefix. Its named
editable regions are `loading`, `error`, and `album`.

`source-id` defaults to `photo-albums`, but it can point to any installed
instance of the integration. Image and download URLs follow that selected
Source automatically.
