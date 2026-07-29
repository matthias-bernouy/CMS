# Stillroom Photography Site Template

Stillroom is a complete, image-first P9R starter for photographers, visual
artists, and small studios. It combines a restrained portfolio with responsive
CMS-managed media and the official `photo-albums` integration without ad-hoc
requests in authored HTML.

## Included Pages

- `/` introduces the studio and lists recent albums.
- `/albums` provides a paginated album catalogue.
- `/photo-album?slug=...` renders a query-driven album gallery.
- `/a-propos` describes the studio, commissions, and working area.
- `/contact` provides contact, image-removal, credit, and licensing channels.
- `/informations/mentions-legales`, `/informations/confidentialite`, and
  `/informations/cookies` provide publication-blocking legal starters for a
  business established in France.
- `/404` provides the configured not-found experience.

The template imports `basic-blocs@1.0.0` and `photo-albums@1.0.0`. Installing
Photo Albums requires a configured Supabase connector in the target CMS; no
connector key, project id, credential, or generated installation snapshot is
stored here.

## Customize Before Publication

1. Replace the site name, public host, and favicon in `site/system.json`; keep
   `fr-FR` unless all authored content is localized together.
2. Replace the Stillroom brand, navigation, contact addresses, and legal
   placeholders. Search for `data-template-placeholder` and `.example`.
3. Replace `site/files/template/coastal-dawn.jpg` with licensed work and reindex
   CMS files so its stable id remains synchronized.
4. Review every legal statement against the final business, host, analytics,
   forms, and external services. The included pages are a starter, not legal
   advice.
5. Install the official integrations, add album content through Photo Albums,
   and test loading, empty, error, and populated states.

The dynamic album page uses a `slug` query parameter. Until P9R supports
route-aware dynamic metadata, all albums share that page's title, description,
canonical URL, and sitemap entry.
