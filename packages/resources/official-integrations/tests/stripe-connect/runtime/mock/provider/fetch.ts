import { expect } from "bun:test";
import type { StripeConnectMock } from "../stripe-connect";
import { handleStripeAccountRoutes } from "./accounts";
import { handleStripeBalanceRoutes } from "./balances";
import { handleStripeDisputeRoutes } from "./disputes";
import { handleStripePaymentRoutes } from "./payments";
import { handleStripePayoutRoutes } from "./payouts";
import { handleStripeRefundRoutes } from "./refunds";
import { handleStripeTransferRoutes } from "./transfers";

const routeHandlers = [
    handleStripeAccountRoutes,
    handleStripeBalanceRoutes,
    handleStripePayoutRoutes,
    handleStripePaymentRoutes,
    handleStripeDisputeRoutes,
    handleStripeTransferRoutes,
    handleStripeRefundRoutes,
];

export async function fetchStripeProvider(
    mock: StripeConnectMock,
    request: Request,
    url: URL,
    method: string,
): Promise<Response> {
    expect(request.headers.get("authorization")).toBe("Bearer sk_test_123");
    if (url.pathname.startsWith("/v1/")) {
        expect(request.headers.get("stripe-version")).toBe("2026-02-25.clover");
    }
    if (url.pathname.startsWith("/v2/")) {
        expect(request.headers.get("stripe-version")).toBe("2026-06-24.dahlia");
        expect(request.headers.get("content-type")).toBe("application/json");
    }
    mock.stripeRequests.push({
        method,
        pathname: url.pathname,
        searchParams: Array.from(url.searchParams.entries()),
        idempotencyKey: request.headers.get("idempotency-key"),
        stripeAccount: request.headers.get("stripe-account"),
    });
    for (const handleRoute of routeHandlers) {
        const response = await handleRoute(mock, request, url, method);
        if (response) {
            return response;
        }
    }
    throw new Error(`unexpected Stripe fetch: ${method} ${url}`);
}
