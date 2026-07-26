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

export type IntegrationRegistryStablePromotionRecord = Readonly<{
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
