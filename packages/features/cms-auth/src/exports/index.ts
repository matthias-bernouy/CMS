/**
 * @bernouy/cms-auth — CMS-owned authentication primitives.
 *
 * Surface intentionally narrow: the auth chain (LocalAuth + OidcAuth + signed
 * session cookie + PAT verification), the membership / identity-provider /
 * credential / rate-limiter stores, and the page renderers (login, forbidden)
 * + middleware (authGuard) the host runtime needs to gate admin surfaces.
 *
 * The web component `<cms-login-methods>` lives under the `./components`
 * subpath so consumers can import it into their browser bundle without
 * pulling Node-side modules. The Mongo-backed stores live under the
 * `./mongo` subpath — composition roots only; the root export stays
 * network-adapter-free.
 */

// ── Authentication ─────────────────────────────────────────────────────
export type { Authentication, Subject, DefaultRole }  from "cms-auth/interfaces/Authentication";
export { SignedCookieCodec }                           from "cms-auth/core/SignedCookieCodec";
export { LocalAuthentication, type LocalAuthConfig } from "cms-auth/default-implementation/LocalAuthentication";
export { OidcAuthentication, type OidcAuthConfig }   from "cms-auth/default-implementation/OidcAuthentication";
export { SubjectResolver, internalUserId }            from "cms-auth/core/SubjectResolver";
export { PiiCrypto, createPiiCrypto }                 from "cms-auth/core/PiiCrypto";
export { mintPatToken, hashPatToken }                 from "cms-auth/core/patToken";
export { toLoginMethod }                              from "cms-auth/core/toLoginMethod";
export { readCookie, setCookie, clearCookie, sanitizeReturnTo } from "cms-auth/core/cookies";

// ── Interfaces ─────────────────────────────────────────────────────────
export type { UsersRepository, Identity, TUser, UsersListOptions, UsersPage } from "cms-auth/interfaces/UsersRepository";
export type {
    IdentityProvider, IdentityProviderRepository, IdentityProviderKind,
    LoginMethod, NewIdentityProvider, IdentityProviderPatch,
} from "cms-auth/interfaces/IdentityProvider";
export type { LocalCredentialStore, LocalCredential, NewCredential } from "cms-auth/interfaces/LocalCredentialStore";
export type { PatRepository, Pat, PatPrincipal, NewPat }             from "cms-auth/interfaces/PatRepository";
export type { RateLimiter, RateLimitResult, RateLimitPolicy }        from "cms-auth/interfaces/RateLimiter";
export type { SecretReader }                                          from "cms-auth/interfaces/SecretReader";

// ── Default implementations (in-memory; Mongo under ./mongo) ───────────
export { InMemoryUsersRepository }            from "cms-auth/default-implementation/InMemoryUsersRepository";
export { InMemoryIdentityProviderRepository } from "cms-auth/default-implementation/InMemoryIdentityProviderRepository";
export { InMemoryLocalCredentialStore }       from "cms-auth/default-implementation/InMemoryLocalCredentialStore";
export { InMemoryPatRepository }              from "cms-auth/default-implementation/InMemoryPatRepository";
export { InMemoryRateLimiter }                from "cms-auth/default-implementation/InMemoryRateLimiter";

// ── HTTP (mountable by surfaces) ───────────────────────────────────────
export { renderLoginPage }                                   from "cms-auth/http/loginPage";
export { renderAuthPage }                                    from "cms-auth/http/renderAuthPage";
export { createAuthGuard, type AuthGuardContext }            from "cms-auth/http/authGuard";
