export const settingsProjection = {
    id: "default",
    mode: "hybrid",
    defaultCurrency: "eur",
    requireVerifiedSeller: true,
    offerModeration: "none",
    pricePolicy: "free",
    wholeUnitPrices: true,
    autoApprovePriceInRange: false,
    requireFinalPriceApproval: true,
    sellerCanPublish: false,
    activeC2cFeePolicyId: 101,
    activeC2cProtectionPolicyId: 102,
    activeC2cSellerRiskPolicyId: 103,
    version: 8,
    createdAt: "2026-07-01T08:00:00Z",
    updatedAt: "2026-07-22T09:30:00Z",
};

export const settingsConsumedFields = [
    "mode",
    "defaultCurrency",
    "requireVerifiedSeller",
    "offerModeration",
    "pricePolicy",
    "wholeUnitPrices",
    "autoApprovePriceInRange",
    "requireFinalPriceApproval",
    "sellerCanPublish",
    "version",
] as const;

export const sellerConsumedFields = [
    "id",
    "displayName",
    "slug",
    "kind",
    "cmsUserId",
    "verificationStatus",
    "version",
] as const;

export function sellerRow(state: { status: string; verifiedAt: string | null; verifiedBy: string | null }) {
    return {
        id: 184,
        kind: "user",
        cms_user_id: null,
        slug: "seller-184",
        display_name: "Marketplace seller",
        verification_status: state.status,
        verified_at: state.verifiedAt,
        verified_by: state.verifiedBy,
        metadata: { riskTier: "standard", privateNote: null },
        version: 5,
        created_at: "2026-07-01T08:00:00Z",
        updated_at: "2026-07-22T10:00:00Z",
    };
}

export function sellerProjection(state: { status: string; verifiedAt: string | null; verifiedBy: string | null }) {
    return {
        id: 184,
        kind: "user",
        cmsUserId: null,
        slug: "seller-184",
        displayName: "Marketplace seller",
        verificationStatus: state.status,
        verifiedAt: state.verifiedAt,
        verifiedBy: state.verifiedBy,
        metadata: { riskTier: "standard", privateNote: null },
        version: 5,
        createdAt: "2026-07-01T08:00:00Z",
        updatedAt: "2026-07-22T10:00:00Z",
    };
}

export function pick(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
    return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
