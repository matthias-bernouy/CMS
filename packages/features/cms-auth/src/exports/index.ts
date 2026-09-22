/**
 * @bernouy/cms-auth — CMS-owned authentication primitives.
 *
 * Authentication contracts, session assembly, public action composition and
 * in-memory stores. Administrative mutations and HTTP registrars have explicit
 * ./management and ./http entrypoints.
 *
 * Browser-safe helpers live under ./browser. Mongo and SMTP adapters live
 * under ./mongo and ./smtp for composition roots; neither is loaded here.
 */

// ── Authentication ─────────────────────────────────────────────────────
export type { Authentication, Subject } from "cms-auth/application/interfaces/Authentication";
export type {
    LocalAuthenticationActions,
    LocalLoginResult,
} from "cms-auth/application/interfaces/LocalAuthenticationActions";
export { SignedCookieCodec } from "cms-auth/sessions/core/SignedCookieCodec";
export {
    LocalAuthentication,
    type LocalAuthConfig,
} from "cms-auth/application/core/authentication/LocalAuthentication";
export {
    OidcAuthentication,
    type OidcAuthConfig,
} from "cms-auth/application/core/authentication/OidcAuthentication";
export { SubjectResolver } from "cms-auth/accounts/core/SubjectResolver";
export { resolveRequestSubject } from "cms-auth/application/core/authentication/requestSubject";
export {
    createPublicAuthActions,
    type PublicAuthActions,
    type PublicAuthActionsConfig,
} from "cms-auth/application/core/public-flows/PublicAuthActions";
export {
    validateProviderKind,
    validatePatName,
    isBuiltinProvider,
    AuthValidationError,
} from "cms-auth/application/core/validation";
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
} from "cms-auth/application/core/public-flows/flows";
// ── Interfaces ─────────────────────────────────────────────────────────
export type {
    UsersRepository,
    Identity,
    TUser,
    UsersListOptions,
    UsersPage,
} from "cms-auth/accounts/interfaces/UsersRepository";
export type {
    IdentityProvider,
    IdentityProviderRepository,
    IdentityProviderKind,
    LoginMethod,
    NewIdentityProvider,
    IdentityProviderPatch,
} from "cms-auth/providers/interfaces/IdentityProvider";
export type {
    LocalCredentialStore,
    LocalCredential,
    NewCredential,
} from "cms-auth/providers/interfaces/LocalCredentialStore";
export type {
    PatRepository,
    Pat,
    PatPrincipal,
    NewPat,
} from "cms-auth/tokens/personal-access/interfaces/PatRepository";
export type {
    AuthTokenStore,
    AuthToken,
    AuthTokenPurpose,
    NewAuthToken,
} from "cms-auth/tokens/one-time/interfaces/AuthTokenStore";
export type {
    Emailer,
    AuthEmailRecipient,
    OutboundEmail,
} from "cms-auth/email/interfaces/Emailer";
export type {
    AuthEmailComposer,
    AuthEmailKind,
    AuthEmailComposeInput,
} from "cms-auth/email/interfaces/AuthEmailComposer";

// ── Default implementations (in-memory; Mongo under ./mongo) ───────────
export { InMemoryUsersRepository } from "cms-auth/accounts/default-implementation/memory/InMemoryUsersRepository";
export { InMemoryIdentityProviderRepository } from "cms-auth/providers/default-implementation/memory/InMemoryIdentityProviderRepository";
export { InMemoryLocalCredentialStore } from "cms-auth/providers/default-implementation/memory/InMemoryLocalCredentialStore";
export { InMemoryPatRepository } from "cms-auth/tokens/personal-access/default-implementation/memory/InMemoryPatRepository";
export { InMemoryAuthTokenStore } from "cms-auth/tokens/one-time/default-implementation/memory/InMemoryAuthTokenStore";
export { InMemoryEmailer } from "cms-auth/email/default-implementation/memory/InMemoryEmailer";
export { ConsoleEmailer } from "cms-auth/email/default-implementation/ConsoleEmailer";
export {
    TemplatedAuthEmailComposer,
    type RuntimeAuthEmailTemplate,
    type RuntimeAuthEmailTemplates,
    type TemplatedAuthEmailComposerConfig,
} from "cms-auth/email/default-implementation/TemplatedAuthEmailComposer";
export { DefaultAuthEmailComposer } from "cms-auth/email/default-implementation/DefaultAuthEmailComposer";
export {
    InMemoryAuthentication,
    type InMemoryAuthConfig,
} from "cms-auth/application/default-implementation/memory/InMemoryAuthentication";
