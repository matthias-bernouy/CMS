# CmsCore Site References

Retained declarative site snapshots used as migration and visual references.

## Boundaries

- Keep each site below its own directory. Existing `p9r.config.json` and
  `.p9r-state.json` files are historical metadata, not an active deployment
  contract.
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
- Do not add new deployable site projects or repository templates here. New
  sites are initialized in the CMS and consume released collection and source
  integrations.

## Reference Changes

- Keep authored labels, HTML, CSS classes, tests, and documentation in English.
- Treat query parameters as the public UI state until CMS path parameters are
  explicitly supported for authored pages.
- Preserve static contract tests when changing a snapshot used by a migration
  or visual comparison.
