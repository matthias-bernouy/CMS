/**
 * Mongo adapters of @bernouy/cms-auth — imported by composition roots
 * only (the runtimes wiring a real database), never by surfaces that
 * consume the store contracts.
 */

export { MongoUsersRepository, type MongoUsersConfig }                        from "cms-auth/default-implementation/MongoUsersRepository";
export { MongoIdentityProviderRepository, type MongoIdentityProviderConfig } from "cms-auth/default-implementation/MongoIdentityProviderRepository";
export { MongoLocalCredentialStore, type MongoLocalCredentialConfig }        from "cms-auth/default-implementation/MongoLocalCredentialStore";
export { MongoPatRepository, type MongoPatConfig }                            from "cms-auth/default-implementation/MongoPatRepository";
export { MongoRateLimiter, type MongoRateLimiterConfig }                      from "cms-auth/default-implementation/MongoRateLimiter";
