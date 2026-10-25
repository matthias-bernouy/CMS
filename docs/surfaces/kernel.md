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
- `/.cms/query/*`, `/.cms/mutation/*`, `/.cms/call/*`, `/.cms/blocset`,
  `/.cms/blocstyles` and immutable collection asset routes, whose
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

Production Content reads invoke the selected `ulvia.cms.content` release
through the same Gateway as every other contract. However, `delivery.read`
currently carries operation-specific JSON inside string envelopes: Gateway
validates those envelopes, while the inner projection remains only partially
validated. This is a remaining contract-boundary gap, not a fully typed delivery
protocol; see the [audit](../AUDIT.md).

Kernel still owns the public HTTP presentation boundary: request actor
resolution, Page access preflight,
dynamic indexing calls, response caching, security headers and document-shell
assembly. Moving that last assembly step behind Content would require a defined
delegation model for Content to invoke arbitrary selected capabilities during
server rendering; that model is intentionally not part of the current runtime.

## Rendering Cache And Freshness

The render-input cache considers entries fresh for 30 seconds and permits stale
revalidation until 300 seconds after validation. Successful logical Content or
Installations mutations handled by that Kernel invalidate its render-input
cache. Changes performed through another Kernel or directly against the
Provider depend on revalidation; there
is no cross-process invalidation bus.

The compressed document cache has explicit bounds. The render-input cache uses
unbounded maps, including negative route entries, and currently retrieves the
whole renderable Bloc catalogue rather than only a Page's dependency closure.
Those are measured optimization targets in the [audit](../AUDIT.md), not
guarantees of bounded memory or constant-sized delivery.

## Editor Preview

The editor iframe loads the saved Page's ordinary URL through the same document
renderer, access checks, translations and assets as public navigation. There is
no dedicated Kernel preview route. Draft visibility follows the normal access
rules. The editor maps editable source nodes to that rendered document and can
apply supported text and attribute changes locally; structural changes require
saving and reloading the frame. It is not a complete unsaved-document renderer.

The frame permits same-origin scripts. This preserves real Bloc behavior but
does not isolate collection JavaScript from the editor or other same-origin
Pages. See the [JavaScript trust boundary](../TODO.md#collection-javascript-isolation).
