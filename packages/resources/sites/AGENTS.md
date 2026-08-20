# CmsCore Official Sites

Versioned, declarative site resources maintained by CmsCore.

## Boundaries

- Keep each site below its own directory with a `p9r.config.json` composition
  file and a pushable `site/` tree.
- Site resources may consume installed integration Blocs and public CMS APIs.
  They must not mount routes, connect to databases, or select runtime adapters.
- Do not embed credentials, deployment domains, repository origins, or other
  environment-specific values in site resources.
- Prefer CMS bindings (`cms-source`, `cms-repeat`, `cms-condition`, and
  `cms-param-sync`) over authored JavaScript. Do not issue ad-hoc `fetch()`
  calls from site content.
- Do not place site- or component-specific CSS in the legacy `theme.css`
  resource. Keep it in a local Bloc's scoped `style.css`; use structured CMS
  theme tokens for global design values.
- Imported integrations must already exist in the integration repository. Do
  not inline or duplicate official integration definitions here.

## Site Changes

- Keep authored labels, HTML, CSS classes, tests, and documentation in English.
- Treat query parameters as the public UI state until CMS path parameters are
  explicitly supported for authored pages.
- Add static contract tests for source paths, query parameters, imported
  integrations, and unsafe browser behavior when a site changes.
