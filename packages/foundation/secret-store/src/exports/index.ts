/**
 * @bernouy/secret-store — secrets at rest.
 *
 * Root export = the `SecretStore` contract + the dependency-free in-memory
 * implementation. The envelope-encrypted Mongo store lives under
 * `@bernouy/secret-store/mongo` so surfaces that only consume the contract
 * never see a network adapter — composition roots are the ones expected to
 * import the subpath.
 */

export type { SecretStore } from "secret-store/interfaces/SecretStore";
export type { SecretReader } from "secret-store/interfaces/SecretReader";
export { InMemorySecretStore } from "secret-store/default-implementation/InMemorySecretStore";
export { resolveSecretRefs } from "secret-store/core/resolveSecretRefs";
export { createSecretResolver } from "secret-store/core/createSecretResolver";
export { SecretNotFound } from "secret-store/core/SecretNotFound";
export {
    ValidatingSecretStore,
    validateSecretKey,
    SecretValidationError,
} from "secret-store/core/ValidatingSecretStore";
export {
    SECRET_KEY_MAX_LENGTH,
    SECRET_KEY_PATTERN,
    SECRET_KEY_PATTERN_DESCRIPTION,
    SECRET_REF_PATTERN,
    isValidSecretKey,
    secretKeyError,
    secretKeyToRef,
    secretRefToKey,
    secretRefGlobalPattern,
} from "secret-store/core/secretRef";

export { scopedSecretReader } from "../core/scopedSecretReader";
