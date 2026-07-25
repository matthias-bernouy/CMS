import { makeEndpointUrn, type Source } from "@bernouy/cms-sources";
import { commerceCommand as command, commerceQuery as query } from "./helpers";

export function commerceDashboardEndpoints(): Source["endpoints"] {
    return [
        query("protectedPayments", ["q", "paymentStatus", "settlementStatus", "limit", "offset"]),
        query("protectedPayment", ["orderId"]),
        command("requestOrderRefund", {
            orderId: { type: "number" },
            reason: { type: "string" },
            merchandiseRefundAmount: { type: "number" },
            shippingRefundAmount: { type: "number" },
            protectionFeeRefundAmount: { type: "number" },
        }),
        query("claims", ["status", "reason", "limit", "offset"]),
        query("claim", ["id"]),
        query("claimEvidenceItems", ["claimId", "limit", "offset"]),
        query("claimEvidenceItem", ["id"]),
        {
            urn: makeEndpointUrn("commerce", "claimEvidenceFile"),
            method: "GET",
            access: { mode: "admin" },
            targetUrl: "https://commerce.test/claim-evidence-file",
            responseKind: "file",
            mediaType: "application/octet-stream",
            input: { params: [{ name: "evidenceId", in: "query", schema: { type: "number" }, required: true }] },
            output: [{ status: "200" }],
        },
        command("resolveOrderClaim", {
            claimId: { type: "number" },
            outcome: { type: "string" },
            merchandiseRefundAmount: { type: "number" },
            shippingRefundAmount: { type: "number" },
            sellerTransferAmount: { type: "number" },
            protectionFeeRefundAmount: { type: "number" },
            decisionReason: { type: "string" },
            expectedVersion: { type: "number" },
        }),
        query("refundRequests", ["status", "limit", "offset"]),
        query("refundRequest", ["id"]),
        command("reviewOrderRefund", {
            refundRequestId: { type: "number" },
            decision: { type: "string" },
            reason: { type: "string" },
            expectedVersion: { type: "number" },
        }),
    ];
}
