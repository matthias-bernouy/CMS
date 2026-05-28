/**
 * @bernouy/auth-core — CMS-owned authentication primitives.
 *
 * Surface intentionally narrow: the auth chain (LocalAuth + OidcAuth + signed
 * session cookie + PAT verification), the membership / identity-provider /
 * credential / rate-limiter stores, and the page renderers (login, forbidden)
 * + middleware (authGuard) the host runtime needs to gate admin surfaces.
 *
 * The web component `<cms-login-methods>` lives under the `./components`
 * subpath so consumers can import it into their browser bundle without
 * pulling Node-side modules.
 */

// ── Authentication ─────────────────────────────────────────────────────
export { LocalAuthentication, type LocalAuthConfig } from "auth-core/auth/LocalAuthentication";
export { OidcAuthentication, type OidcAuthConfig }   from "auth-core/auth/OidcAuthentication";
export { SubjectResolver, internalUserId }            from "auth-core/auth/SubjectResolver";
export { PiiCrypto, createPiiCrypto }                 from "auth-core/auth/PiiCrypto";
export { dummyPasswordVerify }                        from "auth-core/auth/passwordTiming";
export { mintPatToken, hashPatToken }                 from "auth-core/auth/patToken";
export { toLoginMethod }                              from "auth-core/auth/toLoginMethod";
export { readCookie, setCookie, clearCookie, sanitizeReturnTo } from "auth-core/auth/cookies";

// ── Interfaces ─────────────────────────────────────────────────────────
export type { UsersRepository, Identity, TUser, UsersListOptions, UsersPage } from "auth-core/interfaces/UsersRepository";
export type {
    IdentityProvider, IdentityProviderRepository, IdentityProviderKind,
    LoginMethod, NewIdentityProvider, IdentityProviderPatch,
} from "auth-core/interfaces/IdentityProvider";
export type { LocalCredentialStore, LocalCredential, NewCredential } from "auth-core/interfaces/LocalCredentialStore";
export type { PatRepository, Pat, PatPrincipal, NewPat }             from "auth-core/interfaces/PatRepository";
export type { RateLimiter, RateLimitResult, RateLimitPolicy }        from "auth-core/interfaces/RateLimiter";
export type { SecretReader }                                          from "auth-core/interfaces/SecretReader";

// ── Default implementations (in-memory + MongoDB) ──────────────────────
export { InMemoryUsersRepository }                          from "auth-core/default-implementation/UsersRepository/memory";
export { MongoUsersRepository, type MongoUsersConfig }       from "auth-core/default-implementation/UsersRepository/mongodb";
export { InMemoryIdentityProviderRepository }                from "auth-core/default-implementation/IdentityProviderRepository/memory";
export { MongoIdentityProviderRepository, type MongoIdentityProviderConfig } from "auth-core/default-implementation/IdentityProviderRepository/mongodb";
export { InMemoryLocalCredentialStore }                      from "auth-core/default-implementation/LocalCredentialStore/memory";
export { MongoLocalCredentialStore, type MongoLocalCredentialConfig } from "auth-core/default-implementation/LocalCredentialStore/mongodb";
export { InMemoryPatRepository }                             from "auth-core/default-implementation/PatRepository/memory";
export { MongoPatRepository, type MongoPatConfig }           from "auth-core/default-implementation/PatRepository/mongodb";
export { InMemoryRateLimiter }                               from "auth-core/default-implementation/RateLimiter/memory";
export { MongoRateLimiter, type MongoRateLimiterConfig }     from "auth-core/default-implementation/RateLimiter/mongodb";
export { MongoDekRepository, type CmsDekDocument }           from "auth-core/default-implementation/MongoDekRepository";

// ── Pages + guard (server) ─────────────────────────────────────────────
export { renderLoginPage }                                   from "auth-core/pages/loginPage";
export { renderForbiddenPage }                               from "auth-core/pages/forbiddenPage";
export { renderAuthPage }                                    from "auth-core/pages/renderAuthPage";
export { createAuthGuard, type AuthGuardContext }            from "auth-core/pages/authGuard";
