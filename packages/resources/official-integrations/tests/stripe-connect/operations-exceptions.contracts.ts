import { describe, expect, test } from "bun:test";
import {
    clearProviderRequests,
    newerAt,
    olderAt,
    postgrestBody,
    postgrestQuery,
    postgrestTables,
    refreshedAt,
    responseBody,
    type CreateDashboardReadHarness,
    type JsonRecord,
} from "./dashboard-contract-harness";

export function registerOperationAndExceptionDashboardContracts(
    createHarness: CreateDashboardReadHarness,
): void {
    describe("stripe-connect operation dashboard read contracts", () => {
        test("keeps exact ordered payloads with one PostgREST read", async () => {
            const harness = await createHarness();
            const firstPaymentId = harness.rest.seedDashboardPayment("order-operation-new");
            const secondPaymentId = harness.rest.seedDashboardPayment("order-operation-old");
            const first = harness.rest.seedDashboardRow("financial_operations", operationRow(
                firstPaymentId, "transfer:new", newerAt, { stripe_object_id: "tr_new" },
            ));
            const second = harness.rest.seedDashboardRow("financial_operations", operationRow(
                secondPaymentId, "refund:old", olderAt, {
                    operation_type: "refund_create", stripe_object_id: null,
                    request: { amount: 400, currency: "eur", refundRequestId: "refund-old" },
                },
            ));
            const thirdPaymentId = harness.rest.seedDashboardPayment("order-operation-outside-page");
            harness.rest.seedDashboardRow("financial_operations", operationRow(
                thirdPaymentId, "transfer:outside-page", olderAt, {},
            ));

            clearProviderRequests(harness);
            const response = await harness.request("admin-1", "admin", "listFinancialOperations", { limit: "2" });
            expect(response.status).toBe(200);
            expect(await responseBody(response)).toEqual({
                operations: [
                    publicOperation(first, "order-operation-new"),
                    publicOperation(second, "order-operation-old"),
                ],
                total: 2,
            });
            expect(postgrestTables(harness)).toEqual(["rpc/list_dashboard_financial_operations"]);
            expect(postgrestBody(harness, 0)).toEqual({
                p_actor_id: "admin-1", p_actor_kind: "admin", p_limit: 2,
                p_search: null, p_status: null,
            });
            expect(harness.rest.stripeRequests).toEqual([]);
        });
    });

    describe("stripe-connect exception dashboard read contracts", () => {
        test("keeps exact list/detail payloads fresh with database-only reads", async () => {
            const harness = await createHarness();
            const first = harness.rest.seedDashboardRow("provider_exceptions", exceptionRow(
                "provider:new", "Newest exception", newerAt,
            ));
            const second = harness.rest.seedDashboardRow("provider_exceptions", exceptionRow(
                "provider:old", "Older exception", olderAt,
            ));
            harness.rest.seedDashboardRow("provider_exceptions", exceptionRow(
                "provider:outside-page", "Outside current page", olderAt,
            ));

            clearProviderRequests(harness);
            const listResponse = await harness.request("admin-1", "admin", "listProviderExceptions", { limit: "2" });
            expect(listResponse.status).toBe(200);
            expect(await responseBody(listResponse)).toEqual({
                exceptions: [publicException(first), publicException(second)],
                total: 2,
            });
            expect(postgrestTables(harness)).toEqual(["provider_exceptions"]);
            expect(postgrestQuery(harness, 0)).toMatchObject({ order: "detected_at.desc", limit: "2" });
            expect(harness.rest.stripeRequests).toEqual([]);

            harness.rest.patchDashboardRow("provider_exceptions", Number(first.id), {
                status: "resolved", message: "Resolved after provider replay",
                resolved_at: refreshedAt, resolved_by: "admin-1",
            });
            clearProviderRequests(harness);
            const detailResponse = await harness.request("admin-1", "admin", "getProviderException", {
                id: String(first.id),
            });
            expect(detailResponse.status).toBe(200);
            expect(await responseBody(detailResponse)).toEqual(publicException({
                ...first, status: "resolved", message: "Resolved after provider replay",
                resolved_at: refreshedAt, resolved_by: "admin-1", updated_at: refreshedAt,
            }));
            expect(postgrestTables(harness)).toEqual(["provider_exceptions"]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });

        test("preserves admin denials and exact missing-detail failures without provider calls", async () => {
            const harness = await createHarness();
            const denied = [
                ["listProviderRefunds", {}], ["getProviderRefund", { refundId: "404" }],
                ["listStripeDisputes", {}], ["getStripeDispute", { disputeId: "dp_missing" }],
                ["listFinancialOperations", {}], ["listProviderExceptions", {}],
                ["getProviderException", { id: "404" }],
            ] as const;
            for (const [endpoint, params] of denied) {
                const response = await harness.request("member-1", "user", endpoint, params);
                expect(response.status).toBe(403);
                expect(await responseBody(response)).toEqual({ error: "the CMS admin role is required" });
            }
            expect(harness.rest.postgrestRequests).toEqual([]);
            expect(harness.rest.stripeRequests).toEqual([]);

            const missing = [
                ["getProviderRefund", { refundId: "404" }, "refund not found"],
                ["getStripeDispute", { disputeId: "dp_missing" }, "Stripe dispute not found"],
                ["getProviderException", { id: "404" }, "provider exception not found"],
            ] as const;
            for (const [endpoint, params, message] of missing) {
                const response = await harness.request("admin-1", "admin", endpoint, params);
                expect(response.status).toBe(404);
                expect(await responseBody(response)).toEqual({ error: message });
            }
            expect(postgrestTables(harness)).toEqual([
                "refunds", "rpc/read_dashboard_disputes", "provider_exceptions",
            ]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });
    });
}

function operationRow(paymentId: number, businessKey: string, at: string, patch: JsonRecord): JsonRecord {
    return {
        payment_id: paymentId, business_key: businessKey, operation_type: "transfer_create",
        status: "succeeded", stripe_object_id: null,
        request: {
            amount: 1080, currency: "eur", releaseAuthorizationId: "release-1",
            nested: { clientSecret: "must-not-leak", kept: "visible" },
        },
        response: { id: "provider-object", authorization: "must-not-leak", status: "succeeded" },
        last_error: null, attempt_count: 1, next_attempt_at: null,
        claimed_at: at, completed_at: at, created_at: at, updated_at: at, ...patch,
    };
}

function publicOperation(row: JsonRecord, clientReferenceId: string): JsonRecord {
    const request = row.request as JsonRecord;
    return {
        providerOperationId: row.id, paymentId: row.payment_id, providerPaymentId: row.payment_id,
        clientReferenceId, businessKey: row.business_key, operationType: row.operation_type,
        status: row.status, amount: request.amount, currency: request.currency,
        releaseAuthorizationId: request.releaseAuthorizationId ?? null,
        refundRequestId: request.refundRequestId ?? null,
        commerceRefundRequestId: request.commerceRefundRequestId ?? null,
        stripeObjectId: row.stripe_object_id,
        request: redact(row.request), response: redact(row.response), lastError: row.last_error,
        attemptCount: row.attempt_count, nextAttemptAt: row.next_attempt_at,
        claimedAt: row.claimed_at, completedAt: row.completed_at,
        providerEventId: `operation:${row.id}:${row.status}`, occurredAt: row.updated_at,
        createdAt: row.created_at, updatedAt: row.updated_at,
    };
}

function exceptionRow(key: string, message: string, at: string): JsonRecord {
    return {
        deduplication_key: key, payment_id: 10, operation_id: 20,
        exception_type: "provider_payment_truth_mismatch", severity: "critical", status: "open",
        message, details: { mismatch: "amount" }, detected_at: at,
        resolved_at: at, resolved_by: "system",
    };
}

function publicException(row: JsonRecord): JsonRecord {
    return {
        id: row.id, deduplication_key: row.deduplication_key,
        payment_id: row.payment_id, operation_id: row.operation_id,
        exception_type: row.exception_type, severity: row.severity, status: row.status,
        message: row.message, details: row.details, detected_at: row.detected_at,
        resolved_at: row.resolved_at, resolved_by: row.resolved_by,
    };
}

function redact(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redact);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value as JsonRecord)
        .filter(([key]) => !["clientsecret", "authorization"].includes(key.toLowerCase()))
        .map(([key, entry]) => [key, redact(entry)]));
}
