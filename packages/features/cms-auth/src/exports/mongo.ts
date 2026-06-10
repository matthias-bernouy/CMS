/**
 * Mongo adapters of @bernouy/cms-auth — imported by composition roots
 * only (the runtimes wiring a real database), never by surfaces that
 * consume the store contracts.
 */

export { MongoUsersRepository, type MongoUsersConfig }                        from "cms-auth/default-implementation/mongo/MongoUsersRepository";
export { MongoIdentityProviderRepository, type MongoIdentityProviderConfig } from "cms-auth/default-implementation/mongo/MongoIdentityProviderRepository";
export { MongoLocalCredentialStore, type MongoLocalCredentialConfig }        from "cms-auth/default-implementation/mongo/MongoLocalCredentialStore";
export { MongoPatRepository, type MongoPatConfig }                            from "cms-auth/default-implementation/mongo/MongoPatRepository";
