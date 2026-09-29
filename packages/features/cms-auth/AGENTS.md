# @bernouy/cms-auth

Feature package for CMS-owned authentication: local credentials, OIDC, PATs,
signed session cookies, public auth flows, and membership stores.

## Layout

- `accounts/`: CMS membership records and identity-to-subject resolution.
- `providers/`: local credentials, password proof, provider configuration and
  OIDC protocol helpers/adapters.
- `sessions/`: shared signed-cookie protocol for local and OIDC login.
- `tokens/`: separate personal-access and one-time token contracts and stores.
- `email/`: transport-neutral composition/errors and optional SMTP delivery.
- `application/`: cross-domain account/public flows, authentication assembly,
  request snapshots and HTTP handlers. It receives runtime-selected stores.
- `exports/`: curated package entrypoints. Tests follow the same domain grouping.

This structural refactor preserves existing email-disabled verification policy
and recovery-token consumption order. The two expected-failure recovery tests
remain tracked limitations, not successful recovery guarantees.

## Boundaries

- Root export exposes adapter-light contracts, session/authentication assembly,
  in-memory implementations, and public-auth action composition. Management
  mutations use `@bernouy/cms-auth/management`; route handlers and registrars
  use `@bernouy/cms-auth/http`.
- `@bernouy/cms-auth/mongo` exposes Mongo repositories for composition roots.
- `@bernouy/cms-auth/smtp` exposes SMTP/configured email delivery for runtime
  composition roots only.
- `@bernouy/cms-auth/browser` exposes browser-safe helpers only. UI components
  belong to their consuming surface or integration.
- This package may depend on `@bernouy/secret-store`,
  `@bernouy/envelope-crypto`, `@bernouy/http-runner`, and
  `@bernouy/rate-limiter`; it must not import surfaces or runtimes.

## Rules

- Never log credentials, PAT tokens, auth tokens, email verification tokens, or
  password reset tokens.
- Public auth routes are mounted under `PUBLIC_AUTH_ROUTES.base` by a surface.
  Control disables signup for its guarded admin context.
- Membership records contain identity and activity metadata only. Authorization
  belongs to views and must not be added to authentication subjects.
- Do not add browser components to this package.
- Keep local password proof in `providers`, cookie protocol in `sessions`, and
  request subject resolution plus HTTP parsing/response construction in
  `application`. Public surfaces receive `PublicAuthActions`, never stores.
- Security-sensitive changes require tests around cookie behavior, rate limits,
  and token expiry.
