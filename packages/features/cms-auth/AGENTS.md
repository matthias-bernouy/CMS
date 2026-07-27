# @bernouy/cms-auth

Feature package for CMS-owned authentication: local credentials, OIDC, PATs,
signed session cookies, public auth flows, and membership stores.

## Boundaries

- Root export exposes auth contracts, default in-memory implementations,
  validation, public auth flow helpers, route handlers, and route registrars.
- `@bernouy/cms-auth/mongo` exposes Mongo repositories for composition roots.
- `@bernouy/cms-auth/browser` exposes browser-safe helpers only. UI components
  belong to their consuming surface or integration.
- This package may depend on `@bernouy/cms-secrets`,
  `@bernouy/envelope-crypto`, `@bernouy/http-runner`, and
  `@bernouy/rate-limiter`; it must not import surfaces or runtimes.

## Rules

- Never log credentials, PAT tokens, auth tokens, email verification tokens, or
  password reset tokens.
- Public auth routes are mounted under `PUBLIC_AUTH_ROUTES.base` by a surface.
  Control disables signup for its guarded admin context.
- Assignment of users to roles lives here; role definitions and grants live in
  `@bernouy/cms-permissions`.
- Do not add browser components to this package.
- Security-sensitive changes require tests around cookie behavior, rate limits,
  token expiry, and last-admin protection.
