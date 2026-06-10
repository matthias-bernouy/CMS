/**
 * @bernouy/cms-auth — CMS-owned authentication primitives.
 *
 * Surface intentionally narrow: the auth chain (LocalAuth + OidcAuth + signed
 * session cookie + PAT verification), the membership / identity-provider /
 * credential stores, and the page renderers (login, forbidden)
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
export { toLoginMethod }                              from "cms-auth/core/toLoginMethod";

// ── Interfaces ─────────────────────────────────────────────────────────
export type { UsersRepository, Identity, TUser, UsersListOptions, UsersPage } from "cms-auth/interfaces/UsersRepository";
export type {
    IdentityProvider, IdentityProviderRepository, IdentityProviderKind,
    LoginMethod, NewIdentityProvider, IdentityProviderPatch,
} from "cms-auth/interfaces/IdentityProvider";
export type { LocalCredentialStore, LocalCredential, NewCredential } from "cms-auth/interfaces/LocalCredentialStore";
export type { PatRepository, Pat, PatPrincipal, NewPat }             from "cms-auth/interfaces/PatRepository";

// ── Default implementations (in-memory; Mongo under ./mongo) ───────────
export { InMemoryUsersRepository }            from "cms-auth/default-implementation/memory/InMemoryUsersRepository";
export { InMemoryIdentityProviderRepository } from "cms-auth/default-implementation/memory/InMemoryIdentityProviderRepository";
export { InMemoryLocalCredentialStore }       from "cms-auth/default-implementation/memory/InMemoryLocalCredentialStore";
export { InMemoryPatRepository }              from "cms-auth/default-implementation/memory/InMemoryPatRepository";

// ── HTTP (mountable by surfaces) ───────────────────────────────────────
export { registerAuthRoutes, type AuthRoutesConfig }         from "cms-auth/http/registerAuthRoutes";
export { renderLoginPage }                                   from "cms-auth/http/loginPage";
export { createAuthGuard, type AuthGuardContext }            from "cms-auth/http/authGuard";
