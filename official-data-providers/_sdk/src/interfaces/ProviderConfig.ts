/**
 * Provider configuration contract (base.md §4.4 / §4.6 / §5 / §8).
 * Pure types only. The validator + defaults live in
 * `core/schemas/providerConfig.ts`.
 */

import type { DeprovisionPolicy } from "src/core/schemas/providerConfig";

/** §8 default offboarding behaviour, decided by the provider.
 *  Source of truth in `core/schemas/providerConfig.ts` (zod schema). */
export type { DeprovisionPolicy };

/** Role of an allowlisted issuer — NOT a token claim (base.md §4.7). */
export type AllowlistRole = "control-plane" | "tenant";

export interface AllowlistEntry {
    /** Issuer URL. `control-plane` = the hub (static, one per provider).
     *  `tenant` entries are auto-populated by provisioning (§8). */
    iss:  string;
    role: AllowlistRole;
}

/** §4.6 crypto profile. Short-lived ES256 by default. */
export interface CryptoProfile {
    algorithms:       string[]; // default ["ES256"]
    tokenTtlSeconds:  number;   // default 120 (range 60–300)
    clockSkewSeconds: number;   // default 30
}

export interface ProviderConfig {
    /** Expected `aud` of incoming tokens (this provider's id). */
    providerId: string;
    /** Optional kind hint (free string convention: "delivery", "payment",
     *  …). Exposed at `/.well-known/data-provider-info`. The hub UI groups
     *  by kind. Pure UI/discovery sugar — no orchestration impact. */
    providerKind?: string;
    /** At least the hub (control-plane); tenants added by provisioning. */
    allowlist: AllowlistEntry[];
    crypto: CryptoProfile;
    defaultDeprovisionPolicy: DeprovisionPolicy;
    /** `data_provider_contract_version` the provider accepts (base.md §4.4). */
    supportedContractVersion: string;
    /** §5 bounded staleness: TTL of the tenant-state cache. */
    tenantStateCacheTtlSeconds: number;
}
