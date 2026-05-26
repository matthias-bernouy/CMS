import { z } from "zod";
import { TENANT_PROVISIONER_CONTRACT_VERSION, CRYPTO_DEFAULTS } from "@bernouy/tenant-provisioner-contract";
import type { ProviderConfig } from "src/interfaces/ProviderConfig";
import { ConfigError } from "src/core/errors";
import { formatZodIssues } from "src/core/zodError";

/** §8 default offboarding behaviour, decided by the provider. Single source
 *  of truth — also consumed by `tenantProvisionerInfo.ts` and (as a TS type)
 *  by `interfaces/ProviderConfig.ts`. */
export const DeprovisionPolicySchema = z.union([
    z.object({ mode: z.literal("immediate") }),
    z.object({ mode: z.literal("grace"), graceSeconds: z.number().int().positive() }),
]);
export type DeprovisionPolicy = z.infer<typeof DeprovisionPolicySchema>;

const C = CRYPTO_DEFAULTS;
const SUPPORTED: readonly string[] = C.algorithms;
const CryptoProfileSchema = z.object({
    // Only the contract's supported algorithms — this list IS the alg
    // allowlist verifyToken enforces; a free-string list could widen it
    // beyond what the platform actually signs (anti alg-confusion).
    algorithms:       z.array(z.string()).min(1)
                        .refine((a) => a.every((alg) => SUPPORTED.includes(alg)),
                            { message: `unsupported algorithm (only ${SUPPORTED.join(", ")})` })
                        .default([...C.algorithms]),
    tokenTtlSeconds:  z.number().int().min(C.tokenTtlMin).max(C.tokenTtlMax).default(C.tokenTtlSeconds),
    clockSkewSeconds: z.number().int().min(0).max(C.clockSkewMax).default(C.clockSkewSeconds),
});

const AllowlistEntrySchema = z.object({
    iss:  z.string().url(),
    role: z.enum(["control-plane", "tenant"]),
});

export const ProviderConfigSchema = z.object({
    providerId:                 z.string().min(1),
    providerKind:               z.string().min(1).optional(),
    allowlist:                  z.array(AllowlistEntrySchema).min(1),
    crypto:                     CryptoProfileSchema.default(() => CryptoProfileSchema.parse({})),
    defaultDeprovisionPolicy:   DeprovisionPolicySchema.default({ mode: "grace", graceSeconds: 7 * 24 * 3600 }),
    supportedContractVersion:   z.string().min(1).default(TENANT_PROVISIONER_CONTRACT_VERSION),
    tenantStateCacheTtlSeconds: z.number().int().min(1).max(300).default(30),
});

/** Parse + apply defaults. Throws `ConfigError` (mapped to RFC 7807). */
export function parseProviderConfig(raw: unknown): ProviderConfig {
    const r = ProviderConfigSchema.safeParse(raw);
    if (!r.success) throw new ConfigError(`invalid ProviderConfig — ${formatZodIssues(r.error)}`);
    return r.data;
}
