import { jsonResponse } from "../../http";
import type { StripeConnectMock } from "../stripe-connect";

export async function handleStripeRefundRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
): Promise<Response | null> {
    if (url.pathname === "/v1/refunds" && method === "GET") {
        if (mock.failProviderRefundList) {
            mock.failProviderRefundList = false;
            return jsonResponse({ error: { message: "simulated Stripe refund list outage" } }, 503);
        }
        const charge = url.searchParams.get("charge");
        const isRecoverySearch = url.searchParams.getAll("expand[]").includes("data.balance_transaction");
        const scenario = isRecoverySearch ? mock.nextRefundSearchScenario : null;
        if (isRecoverySearch) {
            mock.nextRefundSearchScenario = null;
        }
        const matching = mock.providerRefunds.filter((refund) => !charge || refund.charge === charge);
        const data =
            scenario === "no-match" || scenario === "has-more"
                ? []
                : scenario === "ambiguous" && matching[0]
                  ? [...matching, { ...matching[0], id: "re_metadata_ambiguous" }]
                  : matching;
        return jsonResponse({
            data,
            has_more: scenario === "has-more" || scenario === "has-more-match",
        });
    }
    if (url.pathname === "/v1/refunds" && method === "POST") {
        const params = new URLSearchParams(await request.text());
        mock.refundCreateRequests.push({
            parameters: Array.from(params.entries()),
            idempotencyKey: request.headers.get("idempotency-key"),
        });
        mock.moneyCallOrder.push("refund");
        const refundId = `re_${mock.nextRefundId++}`;
        const refundFee = mock.nextRefundFee;
        const commerceReason = params.get("metadata[commerce_reason]");
        const refund = {
            id: refundId,
            charge: params.get("charge"),
            amount: Number(params.get("amount")),
            currency: "eur",
            status: mock.nextRefundStatus,
            metadata: {
                refund_request_id: params.get("metadata[refund_request_id]"),
                ...(commerceReason ? { commerce_reason: commerceReason } : {}),
            },
            ...(mock.nextRefundStatus === "succeeded"
                ? {
                      balance_transaction: {
                          id: `txn_refund_${refundId.slice(3)}`,
                          amount: -Number(params.get("amount")),
                          fee: refundFee,
                          net: -Number(params.get("amount")) - refundFee,
                          currency: "eur",
                          fee_details:
                              refundFee === 0 ? [] : [{ type: "stripe_fee", amount: refundFee, currency: "eur" }],
                      },
                  }
                : {}),
            ...(mock.nextRefundStatus === "failed" ? { failure_reason: "provider_declined" } : {}),
        };
        mock.nextRefundStatus = "succeeded";
        mock.nextRefundFee = 0;
        mock.providerRefunds.push(refund);
        if (mock.loseNextRefundResponse) {
            mock.loseNextRefundResponse = false;
            throw new Error("simulated network loss after Stripe created the Refund");
        }
        return jsonResponse(refund);
    }
    return null;
}
