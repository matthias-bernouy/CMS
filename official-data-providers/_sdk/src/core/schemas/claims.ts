// Single source of the claims validator: the shared contract package
// (consumed identically by the issuer-kit). Re-exported so the SDK's
// existing import paths are unchanged.
export { TokenClaimsSchema } from "@bernouy/data-provider-contract";
export type { TokenClaimsParsed } from "@bernouy/data-provider-contract";
