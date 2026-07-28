# @bernouy/cms-repository

Read-only HTTP surface for publishing CmsCore repository resources.

The first exposed resource is the integration catalogue. The surface receives an
`IntegrationDefinitionRepository` from the runtime, so the same API can publish
definitions backed by local official resources today and an external repository
later.

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
  exact immutable Markdown notes, or `404` for a bootstrapped legacy package.

When a `RepositoryCatalogReader` is injected as `repositoryCatalog`, the
surface also mounts `GET /api/integrations/catalog`. The response schema is
`cms.repository.catalog.v1`; its `view` discriminator is `list`, `integration`,
or `version` according to the optional `kind` and `version` query parameters.
List responses accept the same bounded `q`, `category`, `provider`, and
`compatibility` filters as the server-rendered catalogue. DTO collections use
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

## Transitional Public Catalog Provider

`@bernouy/cms-repository/catalog` exports `RepositoryCatalogPageProvider`. A
runtime injects a bounded `RepositoryCatalogReader`, then registers the provider
with Delivery. The provider has no network adapter, registry dependency, or
Delivery dependency of its own.

The CMS-authored `/integrations` page from `@bernouy/cms-official-sites` is the
authoritative public UI once it has been published. Delivery consults stored CMS
pages first; this provider remains a rollout fallback for repository-management
instances that have not received the site resource yet. It can be removed in a
later release after deployments have converged.

It renders canonical, server-side pages for:

- `/integrations`;
- `/integrations/:kind`;
- `/integrations/:kind/versions/:version`.

The list page supports no-JavaScript search and category, technical-provider,
and compatibility filters. Exact pages show channels, dependencies, artifact
summaries, package identity, safe Markdown release notes and instructions, and
public compatibility history. Package links always target the anonymous
same-origin `/.cms/repository` API. Reader unavailability produces an explicit
uncached error page without affecting unrelated Delivery paths.
