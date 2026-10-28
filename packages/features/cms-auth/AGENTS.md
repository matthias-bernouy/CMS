# @bernouy/cms-auth

Feature package for Provider-owned authentication: local credentials, PATs,
signed session tokens, public account flows, and membership stores.

## Layout

- `accounts/`: CMS membership records and identity-to-subject resolution.
- `providers/`: local credentials and password proof.
- `sessions/`: signed session-token issuance and verification. Cookie policy
  belongs to the Edge boundary that applies a validated session effect.
- `tokens/`: separate personal-access and one-time token contracts and stores.
- `email/`: authentication-owned verification and password-reset composition.
- `application/`: cross-domain account/public flows and credential resolution.
  It receives runtime-selected stores and exposes no routes.
- `exports/`: curated package entrypoints. Tests follow the same domain grouping.

Email-disabled verification policy and operation-bound recovery-token
reservation/finalization are covered by ordinary passing tests. A failed
protected mutation releases its reservation; a finalize retry can resume only
the exact same operation.

## Boundaries

- Root export exposes adapter-light contracts, credential/session assembly,
  in-memory stores and public account action composition. Management mutations
  use `@bernouy/cms-auth/management`.
- `@bernouy/cms-auth/mongo` exposes Mongo repositories for composition roots.
- Outbound delivery belongs to `@bernouy/cms-emailer`; this package authors
  authentication messages through its published `Emailer` port.
- This package may depend on `@bernouy/cms-emailer`,
  `@bernouy/envelope-crypto`, and `@bernouy/rate-limiter`; it must not import
  HTTP runners, surfaces or runtimes.

## Rules

- Never log credentials, PAT tokens, auth tokens, email verification tokens, or
  password reset tokens.
- Authentication is exposed only through a provider contract such as
  `ulvia.cms.access`; do not reintroduce a parallel auth route family.
- Membership records contain identity and activity metadata only. Authorization
  belongs to CMS policies, capability access and trusted gateway actors; it must
  not be added to authentication subjects.
- Do not add browser components to this package.
- Keep local password proof in `providers`, signed session tokens in `sessions`,
  and opaque credential resolution in `application`. Provider surfaces receive
  bounded account-lifecycle actions, never stores.
- Security-sensitive changes require tests around credential precedence, rate
  limits, token expiry and one-time-token recovery. Cookie behavior is tested
  in the Edge surface that owns it.

- `./oauth` owns client-neutral delegated MCP grants, PKCE, rotation and live
  authorization policy injection. These are separate from browser sessions and
  PATs. HTTP protocol handling belongs to the Edge; OAuth is not OIDC login.
