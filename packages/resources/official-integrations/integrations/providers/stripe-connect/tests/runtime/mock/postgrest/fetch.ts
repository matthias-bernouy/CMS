import { expect } from "bun:test";
import { stripeUrl, supabaseUrl } from "../../constants";
import { jsonResponse, requestFromFetchInput } from "../../http";
import type { JsonRecord } from "../../types";
import type { StripeConnectMock } from "../stripe-connect";
import { fetchStripeProvider } from "../provider/fetch";
import { handleDashboardRoutes } from "./dashboard";
import { handleDisputeRoutes } from "./disputes";
import { handlePaymentCancellationRoutes } from "./payments/cancellation";
import { handlePaymentOperationRoutes } from "./payments/operations";
import { handlePaymentReservationRoutes } from "./payments/reservation";
import { handlePayoutOperationRoutes } from "./payouts/operations";
import { handlePlatformPayoutRoutes } from "./payouts/platform";
import { handleSellerPayoutRoutes } from "./payouts/seller";
import { handleProjectionClaimRoutes } from "./projections/claims";
import { handleProjectionEnqueueRoutes } from "./projections/enqueue";
import { handleProjectionReadRoutes } from "./projections/reads";
import { handleSellerExposureRoutes } from "./recovery/seller-exposure";
import { handleTransferRecoveryRoutes } from "./recovery/transfers";
import { handleOperationReadRoutes } from "./reads/operations";
import { handlePaymentReadRoutes } from "./reads/payment";
import { handleSettlementReadRoutes } from "./reads/settlement";
import { handleTableRoutes } from "./reads/tables";

const routeHandlers = [
    handleDashboardRoutes,
    handlePaymentReservationRoutes,
    handlePaymentCancellationRoutes,
    handlePaymentOperationRoutes,
    handleTransferRecoveryRoutes,
    handleSellerExposureRoutes,
    handleSellerPayoutRoutes,
    handlePayoutOperationRoutes,
    handlePlatformPayoutRoutes,
    handleDisputeRoutes,
    handleProjectionClaimRoutes,
    handleProjectionEnqueueRoutes,
    handleProjectionReadRoutes,
    handlePaymentReadRoutes,
    handleSettlementReadRoutes,
    handleOperationReadRoutes,
    handleTableRoutes,
];

export async function fetchStripeConnectMock(
    mock: StripeConnectMock,
    input: RequestInfo | URL,
    init?: RequestInit,
): Promise<Response> {
    if (init?.body instanceof FormData) {
        const purpose = init.body.get("purpose");
        const file = init.body.get("file");
        if (typeof purpose !== "string" || !file || typeof file === "string") {
            throw new Error("invalid Stripe file upload form data");
        }
        mock.fileUploadRequests.push({
            purpose,
            fileName: file.name,
            mimeType: file.type,
            content: Array.from(new Uint8Array(await file.arrayBuffer())),
        });
    }
    const request = requestFromFetchInput(input, init);
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (url.origin === stripeUrl) {
        mock.externalRequestOrder.push(`stripe:${method}:${url.pathname}`);
        return await fetchStripeProvider(mock, request, url, method);
    }
    if (url.origin !== supabaseUrl || !url.pathname.startsWith("/rest/v1/")) {
        throw new Error(`unexpected fetch: ${method} ${request.url}`);
    }

    expect(request.headers.get("apikey")).toBe("supabase-secret-key");
    expect(request.headers.get("authorization")).toBe("Bearer supabase-secret-key");
    expect(request.headers.get("accept-profile")).toBe("stripe_connect");
    if (method !== "GET" && method !== "HEAD") {
        expect(request.headers.get("content-profile")).toBe("stripe_connect");
    }
    const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
    mock.externalRequestOrder.push(`postgrest:${method}:${table}`);
    mock.postgrestRequests.push({
        method,
        table,
        searchParams: Array.from(url.searchParams.entries()),
        body:
            method === "POST" || method === "PATCH"
                ? ((await request
                      .clone()
                      .json()
                      .catch(() => null)) as JsonRecord | null)
                : null,
    });
    if (mock.nextPostgrestWriteFailure?.table === table && mock.nextPostgrestWriteFailure.method === method) {
        mock.nextPostgrestWriteFailure = null;
        return jsonResponse({ message: `simulated ${table} ${method} failure` }, 500);
    }
    if (table === "provider_exceptions" && method === "PATCH" && mock.failProviderExceptionResolution) {
        mock.failProviderExceptionResolution = false;
        return jsonResponse({ message: "simulated provider exception resolution failure" }, 500);
    }
    const isPaymentReconciliationLedgerRead =
        (table === "rpc/read_payment_reconciliation_ledger" && method === "POST") ||
        (table === "transfers" && method === "GET");
    if (isPaymentReconciliationLedgerRead && mock.failPaymentReconciliationLedgerRead) {
        mock.failPaymentReconciliationLedgerRead = false;
        return jsonResponse({ message: "simulated payment ledger read failure" }, 500);
    }
    if (
        table === "rpc/read_payment_reconciliation_local_context" &&
        method === "POST" &&
        mock.failPaymentReconciliationLocalContextRead
    ) {
        mock.failPaymentReconciliationLocalContextRead = false;
        return jsonResponse({ message: "simulated payment reconciliation local context read failure" }, 500);
    }
    const isProviderTransferContextRead =
        table === "rpc/read_provider_transfer_reconciliation_context" ||
        (table === "transfers" && method === "GET" && url.searchParams.has("stripe_transfer_id"));
    if (isProviderTransferContextRead && mock.providerTransferContextReadsBeforeFailure !== null) {
        if (mock.providerTransferContextReadsBeforeFailure === 0) {
            mock.providerTransferContextReadsBeforeFailure = null;
            return jsonResponse({ message: "simulated provider transfer context read failure" }, 500);
        }
        mock.providerTransferContextReadsBeforeFailure--;
    }

    for (const handleRoute of routeHandlers) {
        const response = await handleRoute(mock, request, url, method, table);
        if (response) {
            return response;
        }
    }
    throw new Error(`unexpected PostgREST fetch: ${method} ${table}`);
}
