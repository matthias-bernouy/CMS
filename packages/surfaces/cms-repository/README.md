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
