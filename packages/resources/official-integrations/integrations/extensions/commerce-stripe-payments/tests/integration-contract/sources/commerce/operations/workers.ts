import { makeEndpointUrn, type Source } from "@bernouy/cms-sources";
import { commerceCommand as command, commerceQuery as query } from "./helpers";

export function commerceWorkerEndpoints(): Source["endpoints"] {
    return [
        {
            ...command("processDueOrderDeadlines", { runKey: { type: "string" }, limit: { type: "number" } }),
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            runKey: { type: "string" },
                            processed: { type: "number" },
                            events: { type: "array", items: { type: "object" } },
                        },
                    },
                },
            ],
        },
        {
            ...command("authorizeDueOrderReleases", { runKey: { type: "string" }, limit: { type: "number" } }),
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            runKey: { type: "string" },
                            authorizations: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        status: { type: "string" },
                                        releaseAuthorizationId: { type: "string" },
                                        orderId: { type: "number" },
                                        orderPublicId: { type: "string" },
                                        paymentId: { type: "number" },
                                        businessKey: { type: "string" },
                                        releaseKind: { type: "string" },
                                        sellerId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                                        sellerRequiredMinimumBalanceAmount: { type: "number" },
                                        payoutDelayDays: { type: "number" },
                                        amount: { type: "number" },
                                        currency: { type: "string" },
                                        financialTermsHash: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        },
        {
            ...command("pendingPaymentCancellationAuthorizations", {
                runKey: { type: "string" },
                limit: { type: "number" },
            }),
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            runKey: { type: "string" },
                            authorizations: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        status: { type: "string" },
                                        paymentCancellationRequestId: { type: "number" },
                                        cancellationRequestId: { type: "string" },
                                        orderId: { type: "number" },
                                        orderPublicId: { type: "string" },
                                        clientReferenceId: { type: "string" },
                                        targetOrderStatus: { type: "string" },
                                        reason: { type: "string" },
                                        amount: { type: "number" },
                                        currency: { type: "string" },
                                        financialTermsHash: { type: "string" },
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        },
        {
            ...command("pendingOrderRefundAuthorizations", { runKey: { type: "string" }, limit: { type: "number" } }),
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            runKey: { type: "string" },
                            authorizations: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        status: { type: "string" },
                                        orderId: { type: "number" },
                                        orderPublicId: { type: "string" },
                                        providerPaymentId: { type: "number" },
                                        refundRequestId: { type: "string" },
                                        commerceRefundRequestId: { type: "number" },
                                        businessKey: { type: "string" },
                                        amount: { type: "number" },
                                        authorizedSellerAmount: { type: "number" },
                                        sellerEntitlementReductionAmount: { type: "number" },
                                        sellerRecoveryAmount: { type: "number" },
                                        protectionFeeRefundAmount: { type: "number" },
                                        currency: { type: "string" },
                                        financialTermsHash: { type: "string" },
                                        requiresFinanceApproval: { type: "boolean" },
                                    },
                                },
                            },
                        },
                    },
                },
            ],
        },
        command("recordOrderStripeDispute", {
            orderPublicId: { type: "string" },
            providerEventId: { type: "string" },
            providerDisputeId: { type: "string" },
            status: { type: "string" },
            reason: { type: "string" },
            amount: { type: "number" },
            currency: { type: "string" },
            openedAt: { type: "string" },
            occurredAt: { type: "string" },
            evidenceDueBy: { type: "string" },
            providerSnapshot: { type: "object" },
        }),
    ];
}
