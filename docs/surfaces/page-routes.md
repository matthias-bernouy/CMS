# Page languages and routes

Page content and route persistence belong to `@bernouy/cms-content`; Control
edits them and Delivery serves the published projection. This guide describes
that content repository, not the contract/provider `cms-repository` package.

One page record owns its content and stable ID. Its `paths` map stores a local
path for each configured site language. The default language uses the site
root: `fr: "/about"` becomes `/about`, and `fr: "/"` becomes `/`. Other
languages add a lowercase prefix: `en: "/about"` becomes `/en/about`. The
primary `path` field is the default language's public URL used by delivery and
route lookups. Content is shared across languages in this version.

The page title and description provide default SEO copy. Optional
`seo[language].title` and `seo[language].description` values override it per
language; each omitted value inherits independently. Changing SEO copy, Page
settings, content or a referenced Bloc/file invalidates every rendered language
variant.

The underlying repository supports revision-checked path matrices and localized
SEO. The former `/api/page/seo` route and its static panel have been removed.
The current `ulvia.cms.pages@1.0.0` Control slice creates a Page, manages its
title, description, content, tags, publication, per-language routes and
localized SEO, and exposes the admitted Bloc catalogue used by the Page editor.
All of those flows use versioned capabilities rather than private `/api/*`
transports.

The default language requires a path; other configured languages may have none.
Only the default language and active additional languages are publicly served.
Changing the default language moves the primary URL to that language; a missing
local path is copied from the former primary language. The change is rejected
before route reconfiguration if any new URL collides with another current or
historical page route. Before a default language is configured, Pages can be
created at root paths, but their URLs cannot be renamed.

Each public path has one permanent route record with state `current`,
`redirect`, or `gone`. A current route points to the page ID and language.
Changing or removing a path turns its route into a redirect; another page
cannot claim it. A page may reactivate one of its own redirects. Deleting a page offers a published
alternative. If selected, all its historical paths redirect to that page's
corresponding language URL when present, or its default language URL. Without
an alternative, those paths return 410 Gone and remain reserved. Route records
retain their original page owner when deletion redirects to an alternative.
Gone URLs render the configured Not Found page with HTTP status 410, no
canonical or `hreflang`, and `noindex`. If no published Not Found page is
configured, Delivery returns a plain-text fallback with the same status.

Mongo stores route records in `page_routes`, keyed by the exact public path
through `_id`. Public resolution uses exact route and page-ID lookups plus
singleton system reads; it does not scan the page catalogue. A `pageId` index
supports path edits and deletion. In-memory storage maintains equivalent maps.
Route reconfiguration scans pages only when the default or available site
languages change; ordinary settings updates and public requests do not scan
pages or redirects.
Mongo records a deletion intent on the page before changing its routes. An
interrupted deletion is replayed before route reconfiguration at repository startup;
the pending-intent index limits this scan to unfinished deletions. Route updates
and final page removal can be repeated safely. A page with a pending deletion
is excluded from published reads until recovery finishes.
Mongo also claims the page before a path edit, so concurrent edits of the same
page cannot interleave route reservations. The admin request sends the paths it
originally loaded; a stale request or competing edit receives HTTP 409 and
must reload the language matrix. An interrupted path edit is reconciled from
the saved page at startup: uncommitted new routes are removed, while committed
routes and retired redirects are completed.
Page path writes register an in-flight permit on the singleton system record
before reading the site language. A language route change waits for those permits
to finish before claiming its pending marker, then rejects new route writes
until it completes. Settings saves compare a revision so a save based on older
settings cannot overwrite a completed language switch. Repository startup
clears permits left by an interrupted process before resuming route recovery.
When language settings change, Mongo records the target settings as a pending
route change before writing routes. Public page requests return a non-cacheable
503 while that marker exists. The target settings replace the old settings
only after all routes are reconfigured. Repository startup resumes an interrupted
change before serving pages. The in-memory repository also pauses public
routes while it changes the page maps. A language route change therefore causes
a brief public pause instead of exposing a mixed routing state.

Published language variants get their own canonical URL and HTML language.
When multiple active variants have paths, rendered pages include reciprocal
`hreflang` links and `x-default` for the default language. Static and
materialized XML sitemaps include reciprocal `xhtml:link` alternates for active
variants, including discovered entity URLs, and exclude retired paths.
The sitemap index lists root-level `/sitemap-lang-<code>.<id>.<part>.xml.gz`
files for each active language and `/sitemap-common.<id>.<part>.xml.gz` for
unlocalized and provider URLs. Large language groups split into multiple parts.
Each localized entry retains reciprocal links to every active variant, even
when those variants live in other files.
Materialized snapshots follow the runtime refresh schedule, so a recently
changed path can remain in a snapshot until the next refresh; its public route
already returns the correct redirect or Gone response.

Dynamic entity URLs add the separate [indexing projection](page-indexing.md).
See [workspace architecture](../architecture/README.md) for publication and
read/write facade boundaries.

## Shared surface routes

Editable site Pages and immutable collection Pages also use a site-scoped
surface route registry. A route is unique by `(siteId, surface, path)`, so two
sites may use the same path and Control/Delivery remain separate namespaces.
Collection Pages contribute a default path and may retain a site override;
editable Pages use their own current path. Runtime startup reconciles both
route sources as one desired graph from canonical Page and collection state.
Stale ownership is removed before a path is reassigned, path swaps are safe,
and reconciliation is idempotent after an interrupted partial write. The same
combined reconciliation runs before and after production Page and collection
mutations, under one per-site in-process coordinator.

Every Page owns exactly one surface. Control mounts both collection-owned and
site-owned Control Pages through the same document renderer. Stable Page links
use Page identities rather than stored route strings. Collection admission and
installation reject missing imported targets and Delivery-to-Control links;
editable Page writes and runtime activation resolve every current target. A
Page or collection mutation that would orphan an existing reference is rejected.

Canonical Page/collection state and its derived route projection are still two
durable writes. Current single-runtime recovery is deterministic, but a future
multi-runtime deployment must add a shared lease or MongoDB transaction around
this boundary rather than relying on the process-local coordinator.
