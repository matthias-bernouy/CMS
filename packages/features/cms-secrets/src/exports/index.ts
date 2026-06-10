/**
 * @bernouy/cms-secrets — secrets at rest.
 *
 * Root export = the `SecretStore` contract + the dependency-free in-memory
 * implementation. The envelope-encrypted Mongo store lives under
 * `@bernouy/cms-secrets/mongo` so surfaces that only consume the contract
 * never see a network adapter — composition roots are the ones expected to
 * import the subpath.
 */

export type { SecretStore }     from "cms-secrets/interfaces/SecretStore";
export type { SecretReader }    from "cms-secrets/interfaces/SecretReader";
export { InMemorySecretStore }  from "cms-secrets/default-implementation/InMemorySecretStore";
export { resolveSecretRefs }    from "cms-secrets/core/resolveSecretRefs";
export { createSecretResolver } from "cms-secrets/core/createSecretResolver";
export { SecretNotFound }       from "cms-secrets/core/SecretNotFound";
export { ValidatingSecretStore, validateSecretKey, SecretValidationError } from "cms-secrets/core/ValidatingSecretStore";
