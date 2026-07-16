import {
    capturedFetches,
    jsonResponse,
    setRestResponder,
    type CapturedFetch,
} from "../../../harness";
import {
    adminEventRows,
    buyerEventRows,
    lineRows,
    operationListRows,
    orderRows,
    publicDefinitions,
    saleRows,
} from "./raw";
import {
    authorization,
    claim,
    financialTerms,
    fulfillment,
    operation,
    seller,
    sellerFinancialTerms,
    sellerFulfillment,
    settlement,
} from "./projections";

export function useCompleteOrderResponder(): void {
    setRestResponder(request => {
        const url = new URL(request.url);
        const resource = url.pathname.split("/").at(-1);
        if (resource === "orders") return orderResponse(url);
        if (resource === "order_lines") {
            const rows = url.searchParams.get("select")?.includes("seller_snapshot")
                ? lineRows
                : lineRows.map(({ seller_snapshot: _seller, ...line }) => line);
            return jsonResponse(rows);
        }
        if (resource === "order_events") {
            return jsonResponse(url.searchParams.get("select") === "*" ? adminEventRows : buyerEventRows);
        }
        if (resource === "sellers") {
            return jsonResponse(url.searchParams.has("cms_user_id") ? [{ id: 17 }] : [seller]);
        }
        if (resource === "protected_order_operations") {
            return jsonResponse(url.searchParams.get("select") === "*" ? [operation] : operationListRows);
        }
        if (resource === "order_financial_terms") {
            const buyerProjection = url.searchParams.get("select")?.includes("buyer_protection_fee_amount");
            return jsonResponse([buyerProjection ? financialTerms : sellerFinancialTerms]);
        }
        if (resource === "order_fulfillments") {
            const sellerProjection = url.searchParams.get("select")?.includes("seller_handoff_declared_at");
            return jsonResponse([sellerProjection ? sellerFulfillment : fulfillment]);
        }
        if (resource === "order_settlements") {
            if (url.searchParams.get("select")?.includes("total_refunded_amount")) {
                return jsonResponse([settlement]);
            }
            const { total_refunded_amount: _refund, ...sellerSettlement } = settlement;
            return jsonResponse([sellerSettlement]);
        }
        if (resource === "marketplace_claims") return jsonResponse([claim]);
        if (resource === "custom_field_definitions") return jsonResponse(publicDefinitions);
        if (resource === "get_order_fulfillment_authorization") return jsonResponse(authorization);
        throw new Error(`Unexpected Commerce read-model request: ${request.url}`);
    });
}

export function callsFor(resource: string): CapturedFetch[] {
    return capturedFetches().filter(call => new URL(call.url).pathname.split("/").at(-1) === resource);
}

function orderResponse(url: URL): Response {
    const sellerFilter = url.searchParams.get("seller_id");
    const isDetail = url.searchParams.get("limit") === "1";
    if (sellerFilter && sellerFilter !== "eq.17") return jsonResponse([]);
    const saleProjection = !url.searchParams.get("select")?.includes("seller_id");
    const rows = saleProjection ? saleRows : orderRows;
    return jsonResponse(isDetail ? rows.slice(0, 1) : rows, 200, { "content-range": "2-3/7" });
}
