# Kernel routing

`@bernouy/cms-kernel` is the single site HTTP application. It renders local and
collection Pages through the same registry and document pipeline. Pages carry
no `surface` field: their required access level is derived from every capability
in their exact execution plan, including transitive Bloc requirements.

The Kernel owns route composition and Page HTTP presentation for:

- `/login` and the configured authentication routes;
- feature-owned handlers for the prebuilt `cms-content` browser runtimes;
- generic capability calls implemented by `cms-gateway`;
- every Page path, resolved from the shared site route registry;
- `/.cms/call/*`, `/.cms/blocset`, `/.cms/blocstyles` and immutable collection asset routes, whose
  behavior remains in their owning feature packages;
- sitemap and robots handlers implemented by `cms-seo`.

The two browser assets are mounted explicitly. Adding a file below
`cms-content/src/browser/` never creates a route. Authentication documents live
below `src/http/auth/` because they belong to the bootstrap kernel,
not to an authored administration Page.

New administration screens are ordinary collection Pages. Navigation, shells
and layouts are ordinary Blocs composed by those Pages. The Kernel resolves the
selected Page, its transitive Blocs and its exact capability execution plan.
A Page becomes administrative when at least one required capability requires
administrator access. Calls without a same-origin referring Page and an exact
active plan fail closed. No second administration transport exists alongside
the capability model.

Collection Pages use native links whose static pathname names the target Page's
declared default route:

```html
<a href="/admin/pages?id={{ page.id | urlencode }}">Open Page</a>
```

Successful capability forms declare the same kind of URL in
`cms-mutation-redirect`. Admission keeps the pathname static and permits bounded
query or fragment interpolation. Before returning HTML, the Kernel resolves
collection default paths to the current site route override in one batch.
