# CmsCore Site Templates

Reusable P9R starters built from declarative pages, local Blocs, official
integration imports, CMS-managed files, and site theme resources.

## Templates

- `default-site` provides a polished general-purpose studio starter with an
  image-led landing page, about, contact, and not-found pages, and only the
  official `basic-blocs` integration. Its authored pages contain no classes,
  inline styles, raw layout elements, local Blocs, or browser scripts.
- `site-photo` provides an image-first portfolio for photographers, visual
  artists, and small studios. It includes a paginated album catalogue, a dynamic
  album gallery, studio and contact pages, and publication-blocking legal
  placeholders.

Every template directory can be copied as a regular P9R project. Configure the
official integration repository and connector environment for the target CMS,
then inspect the import before publishing it:

```bash
p9r push --dry-run
p9r push --yes
```

Deployment credentials, connector configuration, final domains, and production
content are intentionally not stored in this collection.
