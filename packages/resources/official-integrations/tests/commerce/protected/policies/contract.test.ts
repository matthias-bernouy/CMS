import { describe, expect, test } from "bun:test";
import {
    registerRefundAllocationsTest,
    registerPayoutControlsTest,
    registerSellerReserveTest,
    registerClaimEntitlementTest,
    registerRefundBoundariesTest,
    registerAuditedFeePolicyTest,
    registerSellerRiskTest,
    registerSellerDebtTest,
    registerProviderReplayTest,
    registerCancellationReplayTest,
    registerPaymentRecoveryTest,
    registerAdminHeadersTest,
    registerPolicyDashboardTest,
    registerPolicySerializationTest,
    registerPolicySubsidyTest,
    registerProviderAbsentCancellationTest,
    registerShipmentReservationTest,
    registerSellerLabelTest,
} from "./contracts";

describe("protected C2C financial policy contract", () => {
    registerRefundAllocationsTest();
    registerPayoutControlsTest();
    registerSellerReserveTest();
    registerClaimEntitlementTest();
    registerRefundBoundariesTest();
    registerAuditedFeePolicyTest();
    registerSellerRiskTest();
    registerSellerDebtTest();
    registerProviderReplayTest();
    registerCancellationReplayTest();
    registerPaymentRecoveryTest();
    registerAdminHeadersTest();
    registerPolicyDashboardTest();
    registerPolicySerializationTest();
    registerPolicySubsidyTest();
    registerProviderAbsentCancellationTest();
    test("keeps claim evidence private and requires carrier proof before resolving a required return", async () => {
        const schema = await Bun.file(
            new URL("../../../../integrations/commerce/versions/1.0.0/connectors/supabase/schema.sql", import.meta.url),
        ).text();
        const definition = (await Bun.file(
            new URL("../../../../integrations/commerce/versions/1.0.0/definition.json", import.meta.url),
        ).json()) as Record<string, unknown>;
        const serialized = JSON.stringify(definition);

        expect(schema).toContain("'commerce-claim-evidence', 'commerce-claim-evidence', false");
        expect(schema).toContain("attach_marketplace_claim_evidence");
        expect(schema).toContain("required return needs trusted recipient handoff before monetary resolution");
        expect(schema).toContain("record_claim_return_delivery");
        expect(serialized).toContain("uploadMyOrderClaimEvidence");
        expect(serialized).toContain("uploadMySaleClaimEvidence");
        expect(serialized).toContain("claimEvidenceFile");
        expect(serialized).toContain("recordClaimReturnDelivery");
        const sourceArtifact = (definition.artifacts as Array<Record<string, unknown>>).find(
            (artifact) => artifact.type === "source",
        ) as { source?: { endpoints?: Array<Record<string, unknown>> } } | undefined;
        const claimEndpoint = sourceArtifact?.source?.endpoints?.find((endpoint) => endpoint.endpointId === "claim");
        expect(JSON.stringify(claimEndpoint)).not.toContain("storagePath");
        const evidenceEndpoints = sourceArtifact?.source?.endpoints?.filter((endpoint) =>
            String(endpoint.endpointId ?? "")
                .toLowerCase()
                .includes("claimevidence"),
        );
        expect(JSON.stringify(evidenceEndpoints)).not.toContain("storagePath");
    });
    registerShipmentReservationTest();
    registerSellerLabelTest();
});
