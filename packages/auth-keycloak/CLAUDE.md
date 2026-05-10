# @bernouy/auth-keycloak

Two `Authentication<Role>` providers backed by Keycloak (or any
OIDC-conformant IdP):

- **`KeycloakConsumer`** — browser-side, **Authorization Code + PKCE**,
  cookie-backed session.
- **`KeycloakBearerConsumer`** — stateless, validates
  `Authorization: Bearer <jwt>` against the realm JWKS.

Both implement `Authentication<Role>` from `@bernouy/core` and are
designed to compose through `@bernouy/auth-composite`.

## Layout

```
src/
├── KeycloakConsumer.ts          public class, registers 4 routes
├── KeycloakBearerConsumer.ts    public class, no routes
├── index.ts                     re-exports both
└── internal/                    everything else, never re-exported
    ├── claims.ts                defaultClaimsToSubject (Keycloak realm_access.roles → "admin"|"user")
    ├── config.ts                KeycloakConsumerConfig — conditional type on claimsToSubject
    ├── cookies.ts               CookieFactory + readCookie
    ├── discovery.ts             OIDC `.well-known/openid-configuration` fetcher (cached)
    ├── oidc.ts                  buildAuthorizeUrl / exchangeCode / buildEndSessionUrl
    ├── pkce.ts                  pkceChallenge + randomUrlSafe
    ├── session.ts               SessionCodec (HS256 JWT for session/flight/post-logout)
    ├── url.ts                   stripTrailingSlash + sanitizeReturnTo + detectCookieSecure
    └── handlers/                4 OIDC route handlers + thin `KeycloakHandlers` façade
```

## `KeycloakConsumer` — what it registers

Mounts under `basePath` (default `/auth`):

| Route | Purpose |
|---|---|
| `GET /login` | builds PKCE pair + state + nonce, stashes them in a signed `flight` cookie, redirects to IdP `authorize_endpoint` |
| `GET /callback` | verifies state/nonce/PKCE, exchanges code for tokens, verifies `id_token` (audience=clientId) and `access_token` (no audience), maps claims → `Subject`, sets the signed session cookie |
| `GET /logout` | builds RP-initiated end-session URL (with `id_token_hint` if a session exists), clears session cookie, stashes a signed post-logout cookie carrying `returnTo` |
| `GET /post-logout-callback` | reads the post-logout cookie, redirects to its `returnTo`, clears the cookie |

There is **no `/error` route shipped here** — the `loginComplete` handler
redirects to `${basePath}/error?reason=…` on failure. The host app must
register it (or accept that the user sees the runner's default 404).

## Session model — three cookies, all stateless

All cookies are HS256-signed JWTs (codec in `internal/session.ts`):

| Cookie | Default name | TTL | Payload `kind` |
|---|---|---|---|
| Session | `be5-session` (configurable) | `sessionTtlSeconds` (3600) | `"session"` — `{ sub, role, displayName, idTokenHint }` |
| Flight | `be5-oidc-flight` | `FLIGHT_TTL_SECONDS = 600` | `"flight"` — `{ state, nonce, codeVerifier, returnTo }` |
| Post-logout | `be5-oidc-post-logout` | `FLIGHT_TTL_SECONDS = 600` | `"post-logout"` — `{ returnTo }` |

All three carry `HttpOnly; SameSite=Lax; Path=/`; `Secure` is auto-
detected from `appBaseUrl` (HTTPS → on) and overridable via
`config.cookieSecure`. There is **no server-side store** — rotating
`sessionSecret` invalidates every existing session and flight in
flight.

## `claimsToSubject` — typed escape hatch

The type of `claimsToSubject` is conditional in `internal/config.ts`:

- `Role = DefaultRole` (`"admin" | "user"`) → optional, defaults to
  `defaultClaimsToSubject` (reads `realm_access.roles`, promotes
  `"admin"` over `"user"`).
- `Role` customized → **required**. The default mapper can't guess your
  role names or priority order.

`id_token` claims always win on overlap; `access_token` only contributes
role/permission claims. Returning `null` aborts with
`?reason=no_subject_from_claims`.

## `KeycloakBearerConsumer`

Same `Authentication<Role>` surface, but consume-only:

- `loginUrl` / `logoutUrl` / `profileUrl` are intentionally **empty
  strings**. `buildLoginUrl()` / `buildLogoutUrl()` return `""`.
  Compose with a cookie consumer through `auth-composite`; the
  composite delegates URL fields to `profileChild`.
- `getSubject(req)` parses `Authorization: Bearer <jwt>`, verifies via
  `createRemoteJWKSet` (issuer pinned, audience optional). Failure →
  `null`, never throws.
- The `claimsToSubject` here is **always required** — no default.
  Share the same function with `KeycloakConsumer` so cookie and bearer
  paths produce identical subjects.

## Conventions

- **`returnTo` sanitization** is centralized in `internal/url.ts`:
  must start with a single `/`, reject `//evil.com`. Reuse it for any
  new path-accepting endpoint.
- **No mutable shared state outside the codec.** Discovery is cached
  inside its own instance; JWKS is cached by `jose.createRemoteJWKSet`.
- **`sessionSecret` ≥ 16 chars** is enforced at construction. In prod,
  use 32 random bytes hex-encoded — the rule is a guard rail, not a
  ceiling.
- **Routes are added through `runner.group(basePath, ...)`** — the
  consumer trusts the runner's group semantics for prefix scoping. Don't
  prepend `basePath` manually inside handler URLs.
- **id_token verification enforces `audience: clientId`**; access_token
  verification deliberately omits `audience` (access tokens target
  resource servers, not the RP). If you change either policy, update
  both `verifyIdToken` and `verifyAccessToken` together.
- **Internal modules stay internal.** Nothing under `internal/` is
  re-exported. If the host needs something from `internal/`, lift it to
  a public file first — don't import paths.

## Dependencies

- runtime: `@bernouy/core` (`Authentication`, `Subject`, `Runner`, `DefaultRole`)
- runtime: `jose` (HS256 sign/verify + `createRemoteJWKSet`)
