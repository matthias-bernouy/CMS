/**
 * @bernouy/cms-auth — CMS-owned authentication primitives.
 *
 * Surface intentionally narrow: the auth chain (LocalAuth + OidcAuth + signed
 * session cookie + PAT verification), the membership / identity-provider /
 * credential stores, and the auth handlers + middleware the host surface needs
 * to gate admin surfaces.
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
export { validatePassword, validateProviderKind, validatePatName, isBuiltinProvider, AuthValidationError } from "cms-auth/core/validation";
export { deleteUserCompletely, type UserDeletionStores } from "cms-auth/core/deleteUserCompletely";
export { createLocalUser, type CreateLocalUserInput, type CreateLocalUserStores } from "cms-auth/core/createLocalUser";
export { changeOwnPassword, type ChangeOwnPasswordStores } from "cms-auth/core/changeOwnPassword";
export {
    deleteIdentityProvider,
    updateIdentityProvider,
    isAdminReachableAfterRemoving,
    type IdentityProviderStores,
} from "cms-auth/core/identityProviderRules";
export { isLastAdmin }                                 from "cms-auth/core/isLastAdmin";

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
export { InMemoryAuthentication, type InMemoryAuthConfig } from "cms-auth/default-implementation/memory/InMemoryAuthentication";

// ── HTTP handlers (mounted by surfaces) ────────────────────────────────
export {
    AUTH_ROUTES,
    localLoginHandler,
    localLogoutHandler,
    oidcLoginHandler,
    oidcCallbackHandler,
    authMethodsHandler,
    type AuthMethodsRoutesConfig,
} from "cms-auth/http/authHandlers";
export { createAuthGuard, type AuthGuardContext }            from "cms-auth/http/authGuard";
