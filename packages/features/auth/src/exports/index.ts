/**
 * @bernouy/auth — CMS-owned authentication primitives.
 *
 * Credential proof, session-token assembly, account lifecycle actions and
 * in-memory stores. Administrative mutations have an explicit ./management
 * entrypoint.
 *
 * Mongo adapters live under ./mongo for composition roots; they are not
 * loaded here.
 */

// ── Authentication ─────────────────────────────────────────────────────
export type { Subject } from "auth/accounts/interfaces/Subject";
export type {
    LocalAuthenticationActions,
    LocalLoginResult,
} from "auth/application/interfaces/LocalAuthenticationActions";
export {
    LocalAuthentication,
    type LocalAuthConfig,
} from "auth/application/core/authentication/LocalAuthentication";
export { SubjectResolver } from "auth/accounts/core/SubjectResolver";
export type { AuthenticationCredential } from "auth/application/core/authentication/RequestSubjectResolver";
export {
    createPublicAuthActions,
    type PublicAuthActions,
    type PublicAuthActionsConfig,
} from "auth/application/core/public-flows/PublicAuthActions";
export { validatePatName, AuthValidationError } from "auth/application/core/validation";
export { personalAccessTokenInput } from "auth/tokens/personal-access/core/input";
export { MAX_PERSONAL_ACCESS_TOKENS, PersonalAccessTokenLimitError } from "auth/tokens/personal-access/core/limits";
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
} from "auth/application/core/public-flows/flows";
// ── Interfaces ─────────────────────────────────────────────────────────
export type {
    UsersRepository,
    Identity,
    TUser,
    UsersListOptions,
    UsersPage,
} from "auth/accounts/interfaces/UsersRepository";
export type {
    LocalCredentialStore,
    LocalCredential,
    NewCredential,
} from "auth/providers/interfaces/LocalCredentialStore";
export type {
    PatRepository,
    Pat,
    PatPrincipal,
    NewPat,
} from "auth/tokens/personal-access/interfaces/PatRepository";
export type {
    AuthTokenStore,
    AuthToken,
    AuthTokenPurpose,
    NewAuthToken,
} from "auth/tokens/one-time/interfaces/AuthTokenStore";
export type {
    AuthEmailComposer,
    AuthEmailKind,
    AuthEmailComposeInput,
} from "auth/email/interfaces/AuthEmailComposer";

// ── Default implementations (in-memory; Mongo under ./mongo) ───────────
export { InMemoryUsersRepository } from "auth/accounts/default-implementation/memory/InMemoryUsersRepository";
export { InMemoryLocalCredentialStore } from "auth/providers/default-implementation/memory/InMemoryLocalCredentialStore";
export { InMemoryPatRepository } from "auth/tokens/personal-access/default-implementation/memory/InMemoryPatRepository";
export { InMemoryAuthTokenStore } from "auth/tokens/one-time/default-implementation/memory/InMemoryAuthTokenStore";
export {
    TemplatedAuthEmailComposer,
    type RuntimeAuthEmailTemplate,
    type RuntimeAuthEmailTemplates,
    type TemplatedAuthEmailComposerConfig,
} from "auth/email/default-implementation/TemplatedAuthEmailComposer";
export { DefaultAuthEmailComposer } from "auth/email/default-implementation/DefaultAuthEmailComposer";

export { SessionTokenService, type SessionTokenServiceConfig } from "auth/sessions/core/SessionTokenService";
export type { SessionRepository, SessionRecord } from "auth/sessions/interfaces/SessionRepository";
export { InMemorySessionRepository } from "auth/sessions/default-implementation/memory/InMemorySessionRepository";
export {
    SESSION_IDLE_TIMEOUT_SECONDS,
    SESSION_ABSOLUTE_TIMEOUT_SECONDS,
    MAX_ACCOUNT_SESSIONS,
} from "auth/sessions/core/sessionPolicy";
