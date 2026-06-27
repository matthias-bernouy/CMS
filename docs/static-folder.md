# Static Folder

`@bernouy/cms-control` serves `src/static/` through
`src/core/registerEndpoints/serveStaticFolder/`. The folder contains
server-rendered admin and editor HTML fragments plus static assets.

## Routing

Every scanned `.html` file becomes a route:

| File | Route |
| --- | --- |
| `static/index.html` | `/` |
| `static/admin/pages.html` | `/admin/pages` |
| `static/admin/index.html` | `/admin` |
| `static/editor/page.html` | `/editor/page` |

Non-HTML assets are served at their relative path. Text assets (`.js`, `.css`,
`.svg`, `.json`, `.txt`, `.xml`, `.map`) are compressed and cached through the
shared HTTP helpers. Pre-compressed binary assets such as `woff2`, images, and
icons are served without a second compression pass.

Skipped files:

- `_template.html` files. They are wrappers, not routes.
- `login.html` and `forbidden.html`. `ControlCms` renders them explicitly
  because they have auth behavior different from the guarded static tree.

## Templates

Each routable HTML fragment is wrapped in the closest `_template.html`, walking
from the file's directory up to `static/`.

The template replacement tokens are:

- `{{CONTENT}}`: replaced with the routed fragment.
- `{{BASE_PATH}}`: replaced with the current runner `basePath` in both the
  template and the fragment.

Any asset URL, form target, fetch URL, or link that points back into Control
should use `{{BASE_PATH}}`.

## Fragment Rules

Routable fragments contain only the content injected into `{{CONTENT}}`. Do not
put `<html>`, `<head>`, or `<body>` in those fragments.

Keep static fragments declarative. Prefer custom elements and data-binding over
page-specific inline scripts. Shared styles and scripts belong in assets or in
browser components.

Editor routes redirect to the relevant admin list when the required `id` query
parameter is missing.

## UI Runtime

Admin pages use:

- `@bernouy/components` for public `<p9r-*>` and `<w13c-*>` elements plus the
  binding runtime.
- `@bernouy/cms-control` browser components for internal `<cms-*>` elements.
- `{{BASE_PATH}}/resources/css/cms-blocs.css` for shared design tokens consumed
  by both admin and authored blocs.
