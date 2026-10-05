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
- `/admin/*`, resolved from the installed collection Control Page registry; it
  returns the kernel `503` recovery document when no matching Page is usable;
- authenticated `/.cms/call/*`, `/.cms/media/*`, `/.cms/image/*` and
  `/.cms/blocset`, which are the shared capability and rendering transports.

The two browser assets are mounted explicitly. Adding a file below
`src/browser/` never creates a route. Authentication documents live below
`src/core/admin/auth/templates/` because they belong to the bootstrap kernel,
not to the authored Control application.

New administration screens must be declared as collection Pages with
`surface: "control"`. Navigation, shells and layouts are ordinary Control-only
Blocs composed by those Pages. The Control surface resolves the selected Page,
its transitive Blocs and its exact capability execution plan. Calls without a
same-origin referring Control Page fail closed. The transitional `/api/*`
surface remains only for functional areas that have not reached collection and
contract parity; it must not become a second Page model.
