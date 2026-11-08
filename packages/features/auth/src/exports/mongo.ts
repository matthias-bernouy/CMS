/**
 * Mongo adapters of @bernouy/auth — imported by composition roots
 * only (the runtimes wiring a real database), never by surfaces that
 * consume the store contracts.
 */

export {
    MongoUsersRepository,
    type MongoUsersConfig,
} from "auth/accounts/default-implementation/mongo/MongoUsersRepository";
export {
    MongoLocalCredentialStore,
    type MongoLocalCredentialConfig,
} from "auth/providers/default-implementation/mongo/MongoLocalCredentialStore";
export {
    MongoPatRepository,
    type MongoPatConfig,
} from "auth/tokens/personal-access/default-implementation/mongo/MongoPatRepository";
export {
    MongoAuthTokenStore,
    type MongoAuthTokenConfig,
} from "auth/tokens/one-time/default-implementation/mongo/MongoAuthTokenStore";

export { MongoOAuthStore } from "auth/oauth/default-implementation/mongo/MongoOAuthStore";

export { MongoSessionRepository } from "auth/sessions/default-implementation/mongo/MongoSessionRepository";
