import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../../../../tests/helpers/integrationDefinition";
import { loadDefinitionFragment } from "../../../../../../../tests/helpers/definitionFragment";

type Endpoint = { endpointId: string; output?: Array<{ status?: string; body?: DataShape }> };
type Definition = { artifacts: Array<{ source?: { endpoints: Endpoint[] }; view?: unknown }> };

describe("commerce financial operations read contracts", () => {
    test("preserves allocated refund facts in protected-payment timelines", async () => {
        const shape = await outputShape("protectedPayment");
        const raw = {
            refundRequests: [
                {
                    id: 19,
                    claimId: 7,
                    businessKey: "claim:7:resolution:3",
                    reason: "marketplace_claim_split",
                    status: "requested",
                    requestedAmount: 5_500,
                    merchandiseRefundAmount: 5_000,
                    shippingRefundAmount: 250,
                    protectionFeeRefundAmount: 250,
                    allocationVersion: 1,
                    sellerRecoveryAmount: 5_000,
                    sellerReserveOffsetAmount: 1_000,
                    requiresFinanceApproval: true,
                    dualApprovalRequired: false,
                    firstApprovedBy: null,
                    firstApprovedAt: null,
                    secondApprovedBy: null,
                    secondApprovedAt: null,
                    version: 1,
                    createdAt: "2026-07-20T09:00:00.000Z",
                    updatedAt: "2026-07-20T09:00:00.000Z",
                    futurePrivateField: true,
                },
            ],
        };

        expect(projectStrictDataShape(raw, shape, "response", { enforceRequired: false })).toEqual({
            refundRequests: [
                {
                    id: 19,
                    claimId: 7,
                    businessKey: "claim:7:resolution:3",
                    reason: "marketplace_claim_split",
                    status: "requested",
                    requestedAmount: 5_500,
                    merchandiseRefundAmount: 5_000,
                    shippingRefundAmount: 250,
                    protectionFeeRefundAmount: 250,
                    allocationVersion: 1,
                    sellerRecoveryAmount: 5_000,
                    sellerReserveOffsetAmount: 1_000,
                    requiresFinanceApproval: true,
                    dualApprovalRequired: false,
                    firstApprovedBy: null,
                    firstApprovedAt: null,
                    secondApprovedBy: null,
                    secondApprovedAt: null,
                    version: 1,
                    createdAt: "2026-07-20T09:00:00.000Z",
                    updatedAt: "2026-07-20T09:00:00.000Z",
                },
            ],
        });
    });

    test("publishes every refund allocation and approval fact consumed by the detail dashboard", async () => {
        const shape = await outputShape("refundRequest");
        const properties = shape.type === "object" ? (shape.properties ?? {}) : {};

        expect(Object.keys(properties)).toEqual(
            expect.arrayContaining([
                "merchandiseRefundAmount",
                "shippingRefundAmount",
                "protectionFeeRefundAmount",
                "allocationVersion",
                "sellerRecoveryAmount",
                "sellerReserveOffsetAmount",
                "firstApprovedBy",
                "firstApprovedAt",
                "secondApprovedBy",
                "secondApprovedAt",
            ]),
        );
    });

    test("keeps dashboards bound to persisted terms, limits, and allocation fields", async () => {
        const artifact = await loadDefinitionFragment<{ view: unknown }>(
            resolve(
                import.meta.dir,
                "../../../../../../extensions/commerce-stripe-payments/definitions/artifacts/dashboards/commerce-stripe-payments-operations/definition.json",
            ),
        );
        const serialized = JSON.stringify(artifact.view);

        for (const path of [
            "financialTerms.merchandiseSubtotalAmount",
            "financialTerms.buyerProtectionFeeAmount",
            "resolutionLimits.remainingBuyerRefundAmount",
            "resolutionLimits.maximumSellerTransferAmount",
            "resolutionLimits.remainingPlatformContributionAmount",
            "resolutionRefund.merchandiseRefundAmount",
            "resolutionRefund.shippingRefundAmount",
            "resolutionRefund.protectionFeeRefundAmount",
            "resolutionRefund.allocationVersion",
            "sellerReserveOffsetAmount",
            "firstApprovedAt",
            "secondApprovedAt",
        ]) {
            expect(serialized).toContain(`"path":"${path}"`);
        }
    });
});

async function outputShape(endpointId: string): Promise<DataShape> {
    const definition = await loadIntegrationDefinition<Definition>(
        resolve(import.meta.dir, "../../../../definition.json"),
    );
    const endpoint = definition.artifacts
        .find((artifact) => artifact.source)
        ?.source?.endpoints.find((candidate) => candidate.endpointId === endpointId);
    const output = endpoint?.output?.find((candidate) => candidate.status === "200")?.body;
    if (!output) {
        throw new Error(`Missing ${endpointId} 200 output shape`);
    }
    return output;
}
