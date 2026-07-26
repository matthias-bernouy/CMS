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
- `GET /api/integrations/definition?kind=<kind>&version=<semver>` returns one
  installable definition. `version` is optional and resolves through the
  repository default channel.
- `GET /api/integrations/package?kind=<kind>&version=<semver>` returns one exact
  canonical version package and its digest metadata.
- `GET /api/integrations/release-notes?kind=<kind>&version=<semver>` returns the
  exact immutable Markdown notes, or `404` for a bootstrapped legacy package.

Every route also exposes `HEAD` and CORS preflight behavior. Package and release
note routes require an exact version and use immutable public caching.
Package `GET` requests require an injected client-address policy and limiter
unless protection is explicitly disabled. The guard executes before reading the
package source; `HEAD`, release notes, and catalog metadata do not consume the
download budget.

## Public Catalog Provider

`@bernouy/cms-repository/catalog` exports `RepositoryCatalogPageProvider`. A
runtime injects a bounded `RepositoryCatalogReader`, then registers the provider
with Delivery. The provider has no network adapter, registry dependency, or
Delivery dependency of its own.

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
