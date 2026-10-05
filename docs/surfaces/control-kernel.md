# Control kernel routing

`@bernouy/cms-control` no longer turns a source directory into application
routes. The former `src/static/` tree, fragment wrappers and recursive scanner
were removed before introducing collection-backed Control Pages.

The surface currently owns only the routes that must exist before a Control
Page can render:

- `/login` and the configured authentication routes;
- `/assets/control-components.js` and `/assets/control-styles.css` while the
  retained legacy components are still available;
- capability calls, provider media and author-file delivery;
- the transitional `/api/*` endpoints;
- `/admin/*`, which returns `503` until the collection Page resolver is mounted.

The two browser assets are mounted explicitly. Adding a file below
`src/browser/` never creates a route. Authentication documents live below
`src/core/admin/auth/templates/` because they belong to the bootstrap kernel,
not to the authored Control application.

Future administration screens must be declared as collection Pages with
`surface: "control"`. Navigation, shells and layouts are ordinary Control-only
Blocs composed by those Pages. The Control surface will resolve the selected
Page and its transitive Bloc/capability plan; it must not reintroduce a parallel
filesystem page model.
