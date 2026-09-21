# Page languages and routes

One page record owns its content and stable ID. Its `paths` map stores a local
path for each configured site language. The default language uses the site
root: `fr: "/about"` becomes `/about`, and `fr: "/"` becomes `/`. Other
languages add a lowercase prefix: `en: "/about"` becomes `/en/about`. The
primary `path` field is the default language's public URL for older consumers.
Content is shared across languages in this version.

The page title and description provide default SEO copy. The **Manage languages**
panel edits optional `seo[language].title` and
`seo[language].description` overrides for every configured language, including
the default. Each empty field inherits its page fallback independently. The
`GET` and `PUT /api/page/seo?id=<page-id>` admin routes read and write these
overrides on the same page record. Changing SEO copy, page settings, page
content, or a referenced bloc/file invalidates the rendered cache entries for
all of that page's language URLs.

The page settings view shows the primary path as readonly. **Manage languages**
edits the URL matrix and expands each language row to show its SEO fields. One
save action applies changed URLs and SEO overrides in that order; if the SEO
request fails after the URL request succeeds, the panel keeps the unsaved SEO
draft and offers a retry. Reopening the panel reloads current paths after a
concurrent edit. The default language requires a path; other configured
languages may have none. Only the default language and active additional
languages are publicly served. Activating a language with a path makes its URL
available without creating another page. Changing the default language moves
the primary URL to that language; a missing local path is copied from the
former primary language. The change is rejected before migration if any new
URL collides with a reserved route.
Delivery owns the `/sitemaps` namespace. The corresponding paths beneath
configured language prefixes, such as `/en/sitemaps` when `en` is configured,
are also reserved so a future default-language change cannot move them into
Delivery's namespace. Their descendants are reserved as well; an ordinary
path such as `/products/sitemaps` remains available when `products` is not a
configured language.
Before a default language is configured, pages can be created at root paths,
but their URLs cannot be renamed.

Each public path has one permanent route record with state `current`,
`redirect`, or `gone`. A current route points to the page ID and language.
Changing or removing a path turns its route into a redirect; another page
cannot claim it. A page may reactivate one of its own redirects. Previous
prefixed default-language URLs migrate to 301 redirects to the root URL.
Deleting a page offers a published
alternative. If selected, all its historical paths redirect to that page's
corresponding language URL when present, or its default language URL. Without
an alternative, those paths return 410 Gone and remain reserved. Route records
retain their original page owner when deletion redirects to an alternative.
Gone URLs render the configured Not Found page with HTTP status 410, no
canonical or `hreflang`, and `noindex`. If no published Not Found page is
configured, Delivery returns a plain-text fallback with the same status.

Mongo stores route records in `page_routes`, keyed by the exact public path
through `_id`. Public resolution uses exact route and page-ID lookups plus
singleton system reads; it does not scan the page catalogue. A `pageId` index supports
path edits and deletion. In-memory storage maintains equivalent maps. Migration
scans pages during repository initialization and when the default or available
site languages change; ordinary settings updates and public requests do not
scan pages or redirects.
Mongo records a deletion intent on the page before changing its routes. An
interrupted deletion is replayed before path migration at repository startup;
the pending-intent index limits this scan to unfinished deletions. Route updates
and final page removal can be repeated safely. A page with a pending deletion
is excluded from published reads until recovery finishes.
Mongo also claims the page before a path edit, so concurrent edits of the same
page cannot interleave route reservations. The admin request sends the paths it
originally loaded; a stale request or competing edit receives HTTP 409 and
must reload the language matrix. An interrupted path edit is reconciled from
the saved page at startup: uncommitted new routes are removed, while committed
routes are completed before the normal path migration runs.
Page path writes register an in-flight permit on the singleton system record
before reading the site language. A language migration waits for those permits
to finish before claiming its pending marker, then rejects new route writes
until it completes. Settings saves compare a revision so a save based on older
settings cannot overwrite a completed language switch. Repository startup
clears permits left by an interrupted process before resuming route recovery.
When language settings change, Mongo records the target settings as a pending
migration before writing routes. Public page requests return a non-cacheable
503 while that marker exists. The target settings replace the old settings
only after all routes are migrated. Repository startup resumes an interrupted
migration before serving pages. The in-memory repository also pauses public
routes while it changes the page maps. A language migration therefore causes
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
when those variants live in other files. Older snapshot URLs remain readable.
Materialized snapshots follow the runtime refresh schedule, so a recently
changed path can remain in a snapshot until the next refresh; its public route
already returns the correct redirect or Gone response.
