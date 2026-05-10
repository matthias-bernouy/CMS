// Backward-compat re-export. The implementation now lives in
// `@bernouy/core` so it can be shared with cms-control-mt's per-tenant
// secret encryption. cdn-buckets keeps the same import surface.
export { EnvelopeSecretCrypto } from "@bernouy/core";
