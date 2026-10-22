/**
 * @bernouy/cms-auth — CMS-owned authentication primitives.
 *
 * Credential proof, session-token assembly, account lifecycle actions and
 * in-memory stores. Administrative mutations have an explicit ./management
 * entrypoint.
 *
 * Browser-safe helpers live under ./browser. Mongo adapters live under
 * ./mongo for composition roots; they are not loaded here.
 */

// ── Authentication ─────────────────────────────────────────────────────
export type { Subject } from "cms-auth/accounts/interfaces/Subject";
export type {
    LocalAuthenticationActions,
    LocalLoginResult,
} from "cms-auth/application/interfaces/LocalAuthenticationActions";
export { SignedCookieCodec } from "cms-auth/sessions/core/SignedCookieCodec";
export {
    LocalAuthentication,
    type LocalAuthConfig,
} from "cms-auth/application/core/authentication/LocalAuthentication";
export { SubjectResolver } from "cms-auth/accounts/core/SubjectResolver";
export type { AuthenticationCredential } from "cms-auth/application/core/authentication/RequestSubjectResolver";
export {
    createPublicAuthActions,
    type PublicAuthActions,
    type PublicAuthActionsConfig,
} from "cms-auth/application/core/public-flows/PublicAuthActions";
export { validatePatName, AuthValidationError } from "cms-auth/application/core/validation";
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
    AuthEmailComposer,
    AuthEmailKind,
    AuthEmailComposeInput,
} from "cms-auth/email/interfaces/AuthEmailComposer";

// ── Default implementations (in-memory; Mongo under ./mongo) ───────────
export { InMemoryUsersRepository } from "cms-auth/accounts/default-implementation/memory/InMemoryUsersRepository";
export { InMemoryLocalCredentialStore } from "cms-auth/providers/default-implementation/memory/InMemoryLocalCredentialStore";
export { InMemoryPatRepository } from "cms-auth/tokens/personal-access/default-implementation/memory/InMemoryPatRepository";
export { InMemoryAuthTokenStore } from "cms-auth/tokens/one-time/default-implementation/memory/InMemoryAuthTokenStore";
export {
    TemplatedAuthEmailComposer,
    type RuntimeAuthEmailTemplate,
    type RuntimeAuthEmailTemplates,
    type TemplatedAuthEmailComposerConfig,
} from "cms-auth/email/default-implementation/TemplatedAuthEmailComposer";
export { DefaultAuthEmailComposer } from "cms-auth/email/default-implementation/DefaultAuthEmailComposer";
