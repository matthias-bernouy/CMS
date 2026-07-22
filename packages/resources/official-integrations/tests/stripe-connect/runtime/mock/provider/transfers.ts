import { jsonResponse } from "../../http";
import type { StripeConnectMock } from "../stripe-connect";

export async function handleStripeTransferRoutes(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
): Promise<Response | null> {
    if (url.pathname === "/v1/transfers" && method === "GET") {
        if (mock.failProviderTransferList) {
            mock.failProviderTransferList = false;
            return jsonResponse({ error: { message: "simulated Stripe Transfer list outage" } }, 503);
        }
        const transferGroup = url.searchParams.get("transfer_group");
        if (mock.omitProviderTransfersFromNextList) {
            mock.omitProviderTransfersFromNextList = false;
            return jsonResponse({ data: [], has_more: false });
        }
        return jsonResponse({
            data: mock.providerTransfers.filter(
                (transfer) => !transferGroup || transfer.transfer_group === transferGroup,
            ),
            has_more: false,
        });
    }
    if (url.pathname === "/v1/transfers" && method === "POST") {
        const params = new URLSearchParams(await request.text());
        mock.moneyCallOrder.push("transfer");
        mock.lastTransferParameters = Object.fromEntries(params.entries());
        if (mock.failNextTransferCreation) {
            mock.failNextTransferCreation = false;
            return jsonResponse({ error: { message: "simulated Stripe Transfer creation failure" } }, 402);
        }
        const id = `tr_${mock.nextTransferId++}`;
        const transfer = {
            id,
            amount: Number(params.get("amount")),
            currency: params.get("currency"),
            destination: params.get("destination"),
            source_transaction: params.get("source_transaction"),
            transfer_group: params.get("transfer_group"),
            metadata: {
                cms_payment_id: params.get("metadata[cms_payment_id]"),
                cms_release_authorization_id: params.get("metadata[cms_release_authorization_id]"),
                cms_release_kind: params.get("metadata[cms_release_kind]"),
            },
            amount_reversed: 0,
            reversed: false,
        };
        mock.providerTransfers.push(transfer);
        if (mock.loseNextTransferCreationResponse) {
            mock.loseNextTransferCreationResponse = false;
            throw new Error("simulated network loss after Stripe created the Transfer");
        }
        return jsonResponse(transfer);
    }
    if (/^\/v1\/transfers\/tr_[^/]+\/reversals$/.test(url.pathname) && method === "GET") {
        const transferId = decodeURIComponent(url.pathname.slice("/v1/transfers/".length, -"/reversals".length));
        const hasMore = mock.nextTransferReversalListHasMore;
        mock.nextTransferReversalListHasMore = false;
        return jsonResponse({ data: mock.providerTransferReversals.get(transferId) ?? [], has_more: hasMore });
    }
    if (/^\/v1\/transfers\/tr_[^/]+\/reversals\/trr_[^/]+$/.test(url.pathname) && method === "GET") {
        const path = url.pathname.slice("/v1/transfers/".length).split("/reversals/");
        const transferId = decodeURIComponent(path[0] ?? "");
        const reversalId = decodeURIComponent(path[1] ?? "");
        const reversal = (mock.providerTransferReversals.get(transferId) ?? []).find(
            (candidate) => candidate.id === reversalId,
        );
        return reversal ? jsonResponse(reversal) : jsonResponse({ error: { message: "reversal not found" } }, 404);
    }
    if (/^\/v1\/transfers\/tr_[^/]+\/reversals$/.test(url.pathname) && method === "POST") {
        const params = new URLSearchParams(await request.text());
        mock.moneyCallOrder.push("reversal");
        const transferId = decodeURIComponent(url.pathname.slice("/v1/transfers/".length, -"/reversals".length));
        mock.transferReversalRequests.push({
            transferId,
            parameters: Array.from(params.entries()),
            idempotencyKey: request.headers.get("idempotency-key"),
        });
        if (mock.failTransferReversals) {
            return new Response(JSON.stringify({ error: { message: "connected account balance is unavailable" } }), {
                status: 402,
                headers: { "content-type": "application/json" },
            });
        }
        const transfer = mock.providerTransfers.find((candidate) => candidate.id === transferId);
        const reversalAmount = Number(params.get("amount"));
        if (transfer) {
            transfer.amount_reversed = Number(transfer.amount_reversed ?? 0) + reversalAmount;
            transfer.reversed = Number(transfer.amount_reversed) >= Number(transfer.amount);
        }
        const reversal = {
            id: `trr_${mock.nextReversalId++}`,
            amount: reversalAmount,
            currency: "eur",
            metadata: { operation_key: params.get("metadata[operation_key]") },
        };
        const providerReversals = mock.providerTransferReversals.get(transferId) ?? [];
        providerReversals.push(reversal);
        mock.providerTransferReversals.set(transferId, providerReversals);
        if (Number(reversal.id.slice("trr_".length)) === mock.loseTransferReversalResponseAt) {
            mock.loseTransferReversalResponseAt = null;
            throw new Error("simulated network loss after Stripe created the reversal");
        }
        return jsonResponse(reversal);
    }
    if (/^\/v1\/refunds\/re_[^/]+$/.test(url.pathname) && method === "GET") {
        const refundId = decodeURIComponent(url.pathname.slice("/v1/refunds/".length));
        const refund = mock.providerRefunds.find((candidate) => candidate.id === refundId);
        return refund ? jsonResponse(refund) : jsonResponse({ error: { message: "refund not found" } }, 404);
    }
    return null;
}
