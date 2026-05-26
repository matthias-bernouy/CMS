import type { AllowlistRole } from "src/interfaces/ProviderConfig";

/**
 * Resolves "is this `iss` trusted, and with what role?" — base.md §4.7
 * (the role is NOT a token claim, it's a property of the matched entry).
 *
 * Phase 03 ships a static impl over `ProviderConfig.allowlist`. Phase 04
 * composes it with the `TenantRegistry` so provisioned tenants resolve too.
 */
export interface IssuerTrust {
    lookup(iss: string): Promise<{ role: AllowlistRole } | null>;
}
