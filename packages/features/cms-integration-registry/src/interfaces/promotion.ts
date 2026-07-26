import type { IntegrationRegistryCatalogSnapshot } from "./catalog";

export type IntegrationRegistryStablePromotionRequest = Readonly<{
    kind: string;
    version: string;
    currentReportRevisionId: string;
    actor: string;
    confirmation: Readonly<{
        version: string;
        reportRevisionId: string;
    }>;
    reason?: string;
}>;

export type LegacyIntegrationRegistryStablePromotionRecordV1 = Readonly<{
    schema: "cms.integration.registry.stable-promotion.v1";
    id: string;
    operationId: string;
    kind: string;
    version: string;
    packageDigest: string;
    reportRevisionId: string;
    previousStable?: string;
    actor: string;
    confirmation: Readonly<{
        version: string;
        reportRevisionId: string;
    }>;
    createdAt: string;
    reason?: string;
}>;

export type IntegrationRegistryStablePromotionRecordV2 = Readonly<{
    schema: "cms.integration.registry.stable-promotion.v2";
    id: string;
    operationId: string;
    kind: string;
    version: string;
    packageDigest: string;
    reportRevisionId: string;
    reportDigest: string;
    reportType: "release-admission-decision";
    previousStable?: string;
    actor: string;
    confirmation: Readonly<{
        version: string;
        reportRevisionId: string;
    }>;
    createdAt: string;
    reason?: string;
}>;

export type IntegrationRegistryStablePromotionRecord =
    | LegacyIntegrationRegistryStablePromotionRecordV1
    | IntegrationRegistryStablePromotionRecordV2;

export type IntegrationRegistryStablePromotionResult = Readonly<{
    operationId: string;
    record: IntegrationRegistryStablePromotionRecord;
    snapshot: IntegrationRegistryCatalogSnapshot;
}>;

export interface IntegrationRegistryStablePromoter {
    promoteStable(
        request: IntegrationRegistryStablePromotionRequest,
    ): Promise<IntegrationRegistryStablePromotionResult>;
}

export type IntegrationRegistryVersionEligibilityDecisionReference = Readonly<{
    revisionId: string;
    digest: string;
}>;

export type IntegrationRegistryVersionBlockRequest = Readonly<{
    kind: string;
    version: string;
    currentDecision: IntegrationRegistryVersionEligibilityDecisionReference;
    actor: string;
    reason: string;
    confirmation: Readonly<{
        action: "block";
        kind: string;
        version: string;
        decisionRevisionId: string;
        decisionDigest: string;
    }>;
}>;

export type IntegrationRegistryVersionInadmissibleRequest = Readonly<{
    kind: string;
    version: string;
    currentDecision: IntegrationRegistryVersionEligibilityDecisionReference;
    actor: string;
    reason: string;
}>;

export type IntegrationRegistryVersionEligibilityRecord = Readonly<{
    schema: "cms.integration.registry.version-eligibility.v1";
    id: string;
    operationId: string;
    action: "block" | "mark-inadmissible";
    kind: string;
    version: string;
    packageDigest: string;
    decision: IntegrationRegistryVersionEligibilityDecisionReference;
    previousStatus?: "blocked" | "inadmissible" | "unverified";
    nextStatus: "blocked" | "inadmissible";
    previousChannels: Readonly<{ stable?: string; latest?: string }>;
    nextChannels: Readonly<{ stable?: string; latest?: string }>;
    provenance: Readonly<{ actor: string; reason: string }>;
    confirmation?: IntegrationRegistryVersionBlockRequest["confirmation"];
    createdAt: string;
}>;

export type IntegrationRegistryVersionEligibilityResult = Readonly<{
    operationId: string;
    record: IntegrationRegistryVersionEligibilityRecord;
    snapshot: IntegrationRegistryCatalogSnapshot;
}>;

export interface IntegrationRegistryVersionEligibilityManager {
    blockVersion(request: IntegrationRegistryVersionBlockRequest): Promise<IntegrationRegistryVersionEligibilityResult>;
    markVersionInadmissible(
        request: IntegrationRegistryVersionInadmissibleRequest,
    ): Promise<IntegrationRegistryVersionEligibilityResult>;
}
