import { describe, expect, test } from "bun:test";
import { projectEndpointResponse, triggerResponseProjection, type SourceEndpoint } from "@bernouy/cms-sources";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../helpers/integrationDefinition";

type EndpointDefinition = {
    endpointId: string;
    method: SourceEndpoint["method"];
    targetUrl: string;
    output?: SourceEndpoint["output"];
};
type Definition = { artifacts: Array<{ source?: { endpoints: EndpointDefinition[] } }> };

const definitionPath = resolve(
    import.meta.dir,
    "../../../integrations/domains/commerce/versions/1.0.0/definition.json",
);

describe("commerce cancellation response privacy", () => {
    test("keeps financial authorizations available only to in-process triggers", async () => {
        const endpoints = await commerceEndpoints();
        for (const endpointId of ["cancelMyOrder", "cancelMySale"]) {
            const definition = endpoints.find((candidate) => candidate.endpointId === endpointId);
            if (!definition?.output) {
                throw new Error(`Missing ${endpointId} response contract`);
            }
            const endpoint: SourceEndpoint = {
                urn: `urn:commerce:${endpointId}`,
                method: definition.method,
                targetUrl: definition.targetUrl,
                output: definition.output,
            };
            const response = await projectEndpointResponse(
                endpoint,
                new Request("https://cms.test/cancel", { method: "POST" }),
                Response.json(cancellationResult(), { status: 201 }),
            );

            expect(await response.clone().json()).toEqual({
                id: 17,
                orderId: 42,
                status: "refund_pending",
                reason: "requested",
            });
            const triggerBody = triggerResponseProjection(response)?.body as {
                refundAuthorization: Record<string, unknown>;
                paymentCancellationAuthorization: Record<string, unknown>;
            };
            expect(triggerBody.refundAuthorization).toMatchObject({
                status: "approved",
                orderId: 42,
                refundRequestId: "refund-17",
            });
            expect(triggerBody.paymentCancellationAuthorization).toMatchObject({
                status: "requested",
                paymentCancellationRequestId: 19,
                orderId: 42,
            });
            expect(triggerBody.refundAuthorization).not.toHaveProperty("requiresDualApproval");
            expect(triggerBody.paymentCancellationAuthorization).not.toHaveProperty("providerPaymentIntentId");
        }
    });
});

function cancellationResult(): Record<string, unknown> {
    return {
        id: 17,
        orderId: 42,
        status: "refund_pending",
        requestedByKind: "buyer",
        requestedBy: "buyer-user-id",
        reason: "requested",
        createdAt: "2026-07-16T00:00:00Z",
        refundAuthorization: {
            status: "approved",
            orderId: 42,
            orderPublicId: "order-public-42",
            providerPaymentId: 9,
            refundRequestId: "refund-17",
            commerceRefundRequestId: 17,
            businessKey: "refund-17",
            amount: 2500,
            merchandiseRefundAmount: 2200,
            shippingRefundAmount: 200,
            allocationVersion: 1,
            authorizedSellerAmount: 1900,
            sellerEntitlementReductionAmount: 300,
            sellerRecoveryAmount: 200,
            protectionFeeRefundAmount: 100,
            currency: "EUR",
            financialTermsHash: "terms-hash",
            requiresFinanceApproval: false,
            requiresDualApproval: true,
        },
        paymentCancellationAuthorization: {
            status: "requested",
            paymentCancellationRequestId: 19,
            cancellationRequestId: "cancel-19",
            orderId: 42,
            orderPublicId: "order-public-42",
            clientReferenceId: "order-public-42",
            targetOrderStatus: "cancelled",
            reason: "requested",
            amount: 2500,
            currency: "EUR",
            financialTermsHash: "terms-hash",
            providerPaymentIntentId: "pi_internal",
        },
    };
}

async function commerceEndpoints(): Promise<EndpointDefinition[]> {
    const definition = await loadIntegrationDefinition<Definition>(definitionPath);
    return definition.artifacts.find((artifact) => artifact.source)?.source?.endpoints ?? [];
}
