# Default Site Template

This is a polished P9R site starter for a studio, agency, or independent
business. It provides a complete landing page, an about page, a contact page,
and a not-found page without choosing a data source or runtime adapter.

Every authored element is supplied by `basic-blocs@1.0.0`. The page
introductions use the SEO-focused Hero, and each page shares the same editable
Site footer recipe. Native elements such as headings, paragraphs, links,
sections, navigation, headers, and footers are installed Blocs too, so their
content and relevant settings remain available in the visual editor. The pages
deliberately contain no classes, inline styles, raw layout wrappers, local Blocs,
scripts, or remote assets. Three local WebP images are registered as CMS files
and use the editable native image Bloc.

The template deliberately ships no `site/theme.css` and no implicit global
tokens. Basic Blocs owns its complete design system, while the theme editor
still lets a site author create independent custom variables when needed.

## Start Here

1. Change the site name, language, host, and favicon in the CMS settings.
2. Open the home, about, contact, and not-found pages in the visual editor and
   replace the starter copy, links, images, sections, and cards.
3. Adjust the Basic Blocs design system or create a custom variable in the theme
   editor when the site needs one.
4. Review the not-found page and its return link.
5. Inspect the import, then publish it from the template directory.

```bash
p9r push --dry-run
p9r push --yes
```
