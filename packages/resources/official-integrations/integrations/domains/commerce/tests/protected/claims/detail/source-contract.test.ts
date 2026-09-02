import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../../../../tests/helpers/integrationDefinition";
import { expectedClaimDetail } from "./expected";

type Endpoint = { endpointId: string; output?: Array<{ status?: string; body?: DataShape }> };
type Definition = { artifacts: Array<{ source?: { endpoints: Endpoint[] } }> };

const definitionPath = resolve(import.meta.dir, "../../../../definition.json");

describe("commerce claim strict Source contract", () => {
    test("preserves the exact claim projection consumed by dashboards", async () => {
        const definition = await loadIntegrationDefinition<Definition>(definitionPath);
        const endpoint = definition.artifacts
            .find((artifact) => artifact.source)
            ?.source?.endpoints.find((candidate) => candidate.endpointId === "claim");
        const shape = endpoint?.output?.find((output) => output.status === "200")?.body;
        if (!shape) {
            throw new Error("Missing claim 200 output shape");
        }

        expect(
            projectStrictDataShape(expectedClaimDetail(), shape, "response", {
                enforceRequired: false,
            }),
        ).toEqual({
            id: 7,
            publicId: "30000000-0000-4000-8000-000000000007",
            orderId: 42,
            reason: "not_as_described",
            status: "return_required",
            description: "The received item differs from the listing.",
            buyerRequestedAmount: 10_000,
            resolutionOutcome: "return_required",
            resolutionBuyerRefundAmount: null,
            resolutionSellerTransferAmount: null,
            resolutionProtectionFeeRefundAmount: null,
            decisionReason: "Return the item before resolution.",
            financialTerms: {
                merchandiseSubtotalAmount: 10_000,
                shippingAmount: 500,
                buyerProtectionFeeAmount: 500,
                buyerTotalAmount: 11_000,
                sellerProceedsAmount: 10_000,
                sellerTransferReleaseAmount: 9_000,
                sellerReserveLiabilityAmount: 1_000,
                sellerShippingShareAmount: 0,
                platformRetainedAmount: 1_000,
                buyerProtectionRefundPolicy: "proportional",
                currency: "eur",
                financialTermsHash: "f".repeat(64),
                financialRevision: 1,
            },
            settlement: {
                status: "blocked",
                authorizedSellerAmount: 10_000,
                totalTransferredAmount: 0,
                totalReversedAmount: 0,
                totalRefundedAmount: 0,
                sellerReserveLiabilityRemainingAmount: 1_000,
                platformGrossRemainderAmount: 11_000,
                manualReviewReason: "marketplace_claim_return_required",
                version: 4,
                updatedAt: "2026-07-20T08:00:00.000Z",
            },
            resolutionLimits: {
                remainingBuyerRefundAmount: 11_000,
                remainingMerchandiseRefundAmount: 10_000,
                remainingShippingRefundAmount: 500,
                remainingProtectionFeeRefundAmount: 500,
                maximumSellerTransferAmount: 10_000,
                remainingPlatformContributionAmount: 500,
            },
            resolutionRefund: null,
            returnShipByAt: "2026-07-25T08:00:00.000Z",
            returnDeliveryStatus: "carrier_accepted",
            returnProviderReference: "return-42",
            returnCarrierAcceptedAt: "2026-07-20T08:00:00.000Z",
            returnRecipientHandoffAt: null,
            version: 3,
            events: [
                {
                    id: 71,
                    eventType: "opened",
                    actorKind: "buyer",
                    message: null,
                    data: { internal_key: "kept_opaque" },
                    createdAt: "2026-07-17T08:00:00.000Z",
                },
                {
                    id: 72,
                    eventType: "return_required",
                    actorKind: "admin",
                    message: "Return authorized",
                    data: { return_flow: true },
                    createdAt: "2026-07-18T08:00:00.000Z",
                },
            ],
            evidence: [
                {
                    id: 81,
                    submittedByKind: "buyer",
                    mimeType: "application/pdf",
                    fileSize: 1_024,
                    originalFilename: "buyer-proof.pdf",
                    sha256: "a".repeat(64),
                    description: null,
                    metadata: { upload_kind: "buyer" },
                    createdAt: "2026-07-17T09:00:00.000Z",
                },
                {
                    id: 82,
                    submittedByKind: "seller",
                    mimeType: "image/png",
                    fileSize: 2_048,
                    originalFilename: "seller-proof.png",
                    sha256: "b".repeat(64),
                    description: "Packing photograph",
                    metadata: { upload_kind: "seller" },
                    createdAt: "2026-07-17T10:00:00.000Z",
                },
            ],
            returnEvents: [
                {
                    id: 91,
                    providerEventId: "return:event:1",
                    providerReference: "return-42",
                    normalizedStatus: "carrier_accepted",
                    occurredAt: "2026-07-20T08:00:00.000Z",
                    createdAt: "2026-07-20T08:01:00.000Z",
                },
                {
                    id: 92,
                    providerEventId: "return:event:2",
                    providerReference: "return-42",
                    normalizedStatus: "in_transit",
                    occurredAt: "2026-07-21T08:00:00.000Z",
                    createdAt: "2026-07-21T08:01:00.000Z",
                },
            ],
        });
    });
});
