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
export type { Authentication, Subject, DefaultRole } from "cms-auth/interfaces/Authentication";
export { SignedCookieCodec } from "cms-auth/core/SignedCookieCodec";
export {
    LocalAuthentication,
    type LocalAuthConfig,
} from "cms-auth/default-implementation/authentication/LocalAuthentication";
export {
    OidcAuthentication,
    type OidcAuthConfig,
} from "cms-auth/default-implementation/authentication/OidcAuthentication";
export { SubjectResolver } from "cms-auth/core/SubjectResolver";
export { resolveRequestSubject } from "cms-auth/http/requestSubject";
export {
    validateProviderKind,
    validatePatName,
    isBuiltinProvider,
    AuthValidationError,
} from "cms-auth/core/validation";
export { deleteUserCompletely, type UserDeletionStores } from "cms-auth/core/accounts/deleteUserCompletely";
export {
    createLocalUser,
    type CreateLocalUserInput,
    type CreateLocalUserStores,
} from "cms-auth/core/accounts/createLocalUser";
export { changeOwnPassword, type ChangeOwnPasswordStores } from "cms-auth/core/accounts/changeOwnPassword";
export {
    signupLocalUser,
    requestEmailVerification,
    confirmEmailVerification,
    requestPasswordReset,
    confirmPasswordReset,
    type PublicAuthFlowConfig,
    type PublicAuthSendResult,
    type SignupLocalUserInput,
    type SignupLocalUserResult,
} from "cms-auth/core/public-auth/flows";
export {
    deleteIdentityProvider,
    updateIdentityProvider,
    type IdentityProviderStores,
} from "cms-auth/core/accounts/identityProviderRules";
export { isLastAdmin } from "cms-auth/core/accounts/isLastAdmin";

// ── Interfaces ─────────────────────────────────────────────────────────
export type {
    UsersRepository,
    Identity,
    TUser,
    UsersListOptions,
    UsersPage,
} from "cms-auth/interfaces/UsersRepository";
export type {
    IdentityProvider,
    IdentityProviderRepository,
    IdentityProviderKind,
    LoginMethod,
    NewIdentityProvider,
    IdentityProviderPatch,
} from "cms-auth/interfaces/IdentityProvider";
export type { LocalCredentialStore, LocalCredential, NewCredential } from "cms-auth/interfaces/LocalCredentialStore";
export type { PatRepository, Pat, PatPrincipal, NewPat } from "cms-auth/interfaces/PatRepository";
export type {
    AuthTokenStore,
    AuthToken,
    AuthTokenPurpose,
    NewAuthToken,
} from "cms-auth/interfaces/AuthTokenStore";
export type {
    Emailer,
    AuthEmailRecipient,
    OutboundEmail,
} from "cms-auth/interfaces/Emailer";
export type {
    AuthEmailComposer,
    AuthEmailKind,
    AuthEmailComposeInput,
} from "cms-auth/interfaces/AuthEmailComposer";

// ── Default implementations (in-memory; Mongo under ./mongo) ───────────
export { InMemoryUsersRepository } from "cms-auth/default-implementation/memory/InMemoryUsersRepository";
export { InMemoryIdentityProviderRepository } from "cms-auth/default-implementation/memory/InMemoryIdentityProviderRepository";
export { InMemoryLocalCredentialStore } from "cms-auth/default-implementation/memory/InMemoryLocalCredentialStore";
export { InMemoryPatRepository } from "cms-auth/default-implementation/memory/InMemoryPatRepository";
export { InMemoryAuthTokenStore } from "cms-auth/default-implementation/memory/InMemoryAuthTokenStore";
export { InMemoryEmailer } from "cms-auth/default-implementation/memory/InMemoryEmailer";
export { ConsoleEmailer } from "cms-auth/default-implementation/ConsoleEmailer";
export {
    SmtpEmailer,
    type SmtpEmailerConfig,
    type SmtpSendMailInput,
    type SmtpTransport,
    type SmtpTransportConfig,
    type SmtpTransportFactory,
} from "cms-auth/default-implementation/SmtpEmailer";
export {
    ConfiguredEmailer,
    EmailConfigurationError,
    isEmailDeliveryDisabledError,
    type ConfiguredEmailerConfig,
    type EmailConfigurationErrorCode,
    type RuntimeEmailSettings,
} from "cms-auth/default-implementation/ConfiguredEmailer";
export {
    TemplatedAuthEmailComposer,
    type RuntimeAuthEmailTemplate,
    type RuntimeAuthEmailTemplates,
    type TemplatedAuthEmailComposerConfig,
} from "cms-auth/default-implementation/TemplatedAuthEmailComposer";
export { DefaultAuthEmailComposer } from "cms-auth/default-implementation/DefaultAuthEmailComposer";
export {
    InMemoryAuthentication,
    type InMemoryAuthConfig,
} from "cms-auth/default-implementation/memory/InMemoryAuthentication";

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
export { createAuthGuard, type AuthGuardContext } from "cms-auth/http/authGuard";
export {
    PUBLIC_AUTH_ROUTES,
    registerPublicAuthRoutes,
    type PublicAuthRoutesConfig,
} from "cms-auth/http/publicAuthHandlers";
export { executeAuthSystemSourceEndpoint } from "cms-auth/http/systemAuthSource";
