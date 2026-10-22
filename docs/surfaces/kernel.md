# Kernel routing

`@bernouy/cms-kernel` is the single site HTTP application. It renders local and
collection Pages through the same registry and document pipeline. Pages carry
no `surface` field: their required access level is derived from every capability
in their static requirements, including transitive Bloc requirements.

The Kernel owns route composition and Page HTTP presentation for:

- collection-contributed authentication Pages such as `/login`;
- feature-owned handlers for the prebuilt `cms-content` browser runtimes;
- generic capability calls implemented by `cms-gateway`;
- every Page path, resolved from the shared site route registry;
- `/.cms/call/*`, `/.cms/blocset`, `/.cms/blocstyles` and immutable collection asset routes, whose
  behavior remains in their owning feature packages;
- sitemap and robots public URLs, whose responses come from the selected
  `ulvia.cms.content` delivery capabilities.

The two browser assets are mounted explicitly. Adding a file below
`cms-content/src/browser/` never creates a route. Authentication documents are
ordinary contributed Pages; the Kernel has no private auth Page or auth route
family.

New administration screens are ordinary collection Pages. Navigation, shells
and layouts are ordinary Blocs composed by those Pages. The Kernel resolves the
selected Page, its transitive Blocs and its capability requirements.
A Page becomes administrative when at least one required capability requires
administrator access. This Page analysis controls rendering and caching, not
live call authority. Gateway calls use the trusted request actor and the
capability's declared access; no second administration transport exists.

Collection Pages use native links whose static pathname names the target Page's
declared default route:

```html
<a href="/admin/pages?id={{ page.id | urlencode }}">Open Page</a>
```

Successful capability forms declare the same kind of URL in
`cms-mutation-redirect`. Admission keeps the pathname static and permits bounded
query or fragment interpolation. Before returning HTML, the Kernel resolves
collection default paths to the current site route override in one batch.

Production Content reads never use a private Provider protocol or a local
repository shortcut. They invoke the selected `ulvia.cms.content` release
through the same Gateway as every other contract. Kernel still owns the public
HTTP presentation boundary: request actor resolution, Page access preflight,
dynamic indexing calls, response caching, security headers and document-shell
assembly. Moving that last assembly step behind Content would require a defined
delegation model for Content to invoke arbitrary selected capabilities during
server rendering; that model is intentionally not part of the current runtime.
