# Edge HTTP Surface

`@bernouy/cms-edge` exposes `EdgeCms` and `EdgeCmsConfig`. Its runtime is
`@bernouy/cms-edge-server`; it is stateless and has no Content rendering or
persistence dependency in its configuration.

Edge mounts MCP/OAuth, generic `/.cms/call`, `/.cms/query` and `/.cms/mutation`
protocols, plus runtime health/readiness. Other public GET/HEAD requests resolve
through the selected `ulvia.cms.content/delivery.resolve-path` capability.
Authentication remains owned by Access. Content receives a verified actor class
and Provider-scoped alias in signed invocation context, never browser cookies.

Content owns Pages, private-site restrictions, Page capability access analysis,
redirects, gone routes, SEO, text substitution, Bloc expansion and the final
HTML document. Styles, browser bundles and collection assets use `/_content/*`.
The generic Edge surface forwards resources uniformly. Its official runtime explicitly
requests the versioned Content theme stylesheet, Bloc bundles, Bloc stylesheets
and generated browser runtimes anonymously, including when the browser has a
session cookie. Only their closed GET/HEAD URL forms qualify. Pages, snapshots,
Files, ambiguous query strings and other assets retain ordinary actor resolution.
See [public Content delivery](../architecture/content-delivery.md).

The resource response adapter enforces a closed metadata set, private caching
for authenticated actors, HTTP security, operator-controlled CSP and streaming
compression. Resource metadata cannot set cookies, CSP, CORS or arbitrary
response headers. Same-origin editor frames are permitted by Edge's HTML policy.

The editor continues to load the saved Page's ordinary URL. There is no separate
preview route or unsaved-document renderer. Administration documents remain
ordinary site-owned Pages copied from generic examples during provisioning.
Collection JavaScript still shares the site's origin; this change does not add
an isolation sandbox around trusted installed Bloc behavior.
