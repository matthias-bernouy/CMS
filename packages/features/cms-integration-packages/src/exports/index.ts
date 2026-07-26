export {
    INTEGRATION_PACKAGE_SCHEMA,
    type IntegrationPackageEnvelopeV1,
    type IntegrationPackageFileEncoding,
    type IntegrationPackageFileV1,
    type IntegrationPackageLimits,
    type IntegrationPackageValidationOptions,
} from "../interfaces/envelope";
export type {
    CanonicalFile,
    CanonicalFileEncoding,
    CanonicalFileSet,
    CanonicalFileSetLimits,
    CanonicalFileSetValidationOptions,
} from "../interfaces/fileSet";
export type {
    IntegrationPackageSource,
    ResolvedIntegrationPackage,
    ResolvedIntegrationPackageMetadata,
} from "../interfaces/source";
export {
    DEFAULT_CANONICAL_FILE_SET_LIMITS,
    DEFAULT_INTEGRATION_PACKAGE_LIMITS,
    resolveCanonicalFileSetLimits,
    resolveIntegrationPackageLimits,
} from "../core/envelope/constants";
export {
    assertCanonicalBase64,
    decodeCanonicalFile,
    decodeIntegrationPackageFile,
    decodedCanonicalFileByteLength,
    decodedIntegrationPackageFileByteLength,
} from "../core/envelope/encoding";
export {
    IntegrationPackageValidationError,
    type IntegrationPackageValidationErrorCode,
} from "../core/envelope/errors";
export { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "../core/envelope/identity";
export { assertCanonicalFilePath, assertIntegrationPackagePath } from "../core/envelope/path";
export {
    parseIntegrationPackageEnvelope,
    validateIntegrationPackageEnvelope,
} from "../core/envelope/validate";
export { canonicalFileSetBytes, validateCanonicalFileSet } from "../core/file-set/validate";
export { parseStrictJsonDocument } from "../core/envelope/strictJson";
export { assertIJsonValue, InvalidIJsonValueError } from "../core/canonical/assertIJson";
export { canonicalJsonBytes, canonicalizeJson } from "../core/canonical/canonicalizeJson";
export { computeIntegrationPackageDigest, sha256Hex } from "../core/digest";
export { INTEGRATION_PACKAGE_DIGEST_HEADER } from "../core/httpContract";
