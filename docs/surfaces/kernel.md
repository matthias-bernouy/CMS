# Kernel routing

`@bernouy/cms-kernel` is the single site HTTP application. It renders local and
collection Pages through the same registry and document pipeline. Pages carry
no `surface` field: their required access level is derived from every capability
in their exact execution plan, including transitive Bloc requirements.

The Kernel owns:

- `/login` and the configured authentication routes;
- `/.cms/assets/component.js` and `/.cms/assets/cms-binding-core.js`, prebuilt
  browser runtimes shared by all rendered Pages;
- generic capability calls;
- every Page path, resolved from the shared site route registry;
- `/.cms/call/*`, `/.cms/blocset` and the immutable asset routes used by Page
  capabilities and rendering;
- sitemap and robots endpoints.

The two browser assets are mounted explicitly. Adding a file below
`src/browser/` never creates a route. Authentication documents live below
`src/auth/` because they belong to the bootstrap kernel,
not to an authored administration Page.

New administration screens are ordinary collection Pages. Navigation, shells
and layouts are ordinary Blocs composed by those Pages. The Kernel resolves the
selected Page, its transitive Blocs and its exact capability execution plan.
A Page becomes administrative when at least one required capability requires
administrator access. Calls without a same-origin referring Page and an exact
active plan fail closed. No second administration transport exists alongside
the capability model.

Collection Pages link by stable identity rather than by an authored URL:

```html
<a
    data-cms-page-ref='{"kind":"contribution","sourceId":"ulvia.official","contributionId":"ulvia-official","pageId":"details"}'
    data-cms-page-suffix="?id={{ page.id }}"
>Open Page</a>
```

Successful capability forms use `data-cms-success-page-ref` with the same
reference shape. Admission accepts only bounded, exact references and optional
query/fragment suffixes. The kernel resolves the current site route override,
writes the final `href` or `cms-source-success-redirect`, and removes the source
metadata before returning HTML.
