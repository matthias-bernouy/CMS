# Photo Albums 1.0.0

Photo Albums stores album state and immutable accepted originals in a private
Supabase connector. Public JSON and image access goes through the installed CMS
Source; browser clients never receive Storage credentials or object paths.

The public Blocs use `publicPhoto` file URLs with intrinsic dimensions. CmsCore
adds only its finite responsive width candidates and keeps generated
derivatives in disposable runtime cache infrastructure. `@bernouy/cms-files`
continues to own site-editor media and is not a second store for album photos.

Version 1.0.0 provides flat categories, ordered albums and photos, publication
status, gallery settings, three backoffice dashboards, an album list Bloc, and
an album gallery Bloc.
