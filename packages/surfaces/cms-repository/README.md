# @bernouy/cms-repository

Read-only HTTP surface for publishing CmsCore repository resources.

The surface receives repository readers from its runtime and publishes their
catalogue, immutable packages, and release evidence. Production CMS runtimes
always point those readers at the configured global repository; ordinary CMS
instances do not mount this surface on Delivery.

## Integration Routes

- `GET /api/integrations` lists integration summaries.
- `GET /api/integrations/index?kind=<kind>` returns one integration index.
- `GET /api/integrations/versions?kind=<kind>` returns the available versions.
- `GET /api/integrations/catalog` returns the CMS-friendly public catalogue
  projection. Optional `q`, `category`, `provider`, `compatibility`, `kind`, and
  `version` query parameters select its list, integration, or exact-version view.
- `GET /api/integrations/definition?kind=<kind>&version=<semver>` returns one
  installable definition. `version` is optional and resolves through the
  repository default channel.
- `GET /api/integrations/package?kind=<kind>&version=<semver>` returns one exact
  canonical version package and its digest metadata.
- `GET /api/integrations/release-notes?kind=<kind>&version=<semver>` returns the
  exact immutable Markdown notes when the package contains them.
- `GET /api/integrations/schema-baselines?kind=<kind>&version=<semver>&packageDigest=<sha256>`
  returns the reviewed connector-schema projections bound to one immutable
  package. Private actors and evidence locations are never exposed.

When a `RepositoryCatalogReader` is injected as `repositoryCatalog`, the
surface also mounts `GET /api/integrations/catalog`. The response schema is
`cms.repository.catalog.v1`; its `view` discriminator is `list`, `integration`,
or `version` according to the optional `kind` and `version` query parameters.
List responses accept bounded `q`, `category`, `provider`, and `compatibility`
filters for the CMS-authored catalogue. DTO collections use
arrays rather than record-shaped maps, exact versions include public download
URLs, and release-note and instruction HTML is rendered through the shared
Markdown sanitizer.

Every route also exposes `HEAD` and CORS preflight behavior. Package and release
note routes require an exact version and use immutable public caching.
Package `GET` requests require an injected client-address policy and limiter
unless protection is explicitly disabled. The guard executes before reading the
package source; `HEAD`, release notes, and catalog metadata do not consume the
download budget.

When a `RepositoryCompatibilityReader` is injected, the surface also mounts
anonymous `GET`, `HEAD`, and `OPTIONS`
`/api/integrations/compatibility?kind=...&version=...`. Optional `after` and
`limit` parameters page append-only revisions; `limit` defaults to 50 and is
bounded to 100. Responses expose an allowlisted projection of the compatibility
V2 `root`, `current`, and `revisions`, with `totalRevisions` and an optional
`nextCursor`. Report provenance retains its bounded reason and evidence IDs but
omits the actor. Findings omit paths and baseline/candidate digests, and the
projection drops internal source or filesystem locations and unknown upstream
fields. Responses use the short public cache policy and a representation ETag
that changes when history is appended.

## Public Catalog UI

This surface does not render public pages. The `/integrations` UI belongs to the
regular CMS site in `packages/resources/sites/cms-repository-hub`, where pages
and Blocs bind to the anonymous same-origin catalog API. Dynamic selection
remains query-based in the UI; `kind` and `version` select the richer API
projections. Deploying the site resource is therefore required: there is no
programmatic Delivery fallback.

`@bernouy/cms-repository/catalog` exports a typed editor data-source descriptor
for the catalog route. The designated hub CMS injects that descriptor into its
own Control editor when `CMS_REPOSITORY_HUB_FACADE_ENABLED=true`, so authors can
select catalog fields without representing the repository API as an installable
integration. Ordinary CMS instances do not receive this descriptor.
