import { describe, expect, test } from "bun:test";
import {
    clearProviderRequests,
    newerAt,
    olderAt,
    postgrestQuery,
    postgrestTables,
    refreshedAt,
    responseBody,
    type CreateDashboardReadHarness,
    type JsonRecord,
} from "../dashboard-contract-harness";

export function registerExceptionDashboardContracts(createHarness: CreateDashboardReadHarness): void {
    describe("stripe-connect exception dashboard read contracts", () => {
        test("keeps exact list/detail payloads fresh with database-only reads", async () => {
            const harness = await createHarness();
            const first = harness.rest.seedDashboardRow(
                "provider_exceptions",
                exceptionRow("provider:new", "Newest exception", newerAt),
            );
            const second = harness.rest.seedDashboardRow(
                "provider_exceptions",
                exceptionRow("provider:old", "Older exception", olderAt),
            );
            harness.rest.seedDashboardRow(
                "provider_exceptions",
                exceptionRow("provider:outside-page", "Outside current page", olderAt),
            );

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
                status: "resolved",
                message: "Resolved after provider replay",
                resolved_at: refreshedAt,
                resolved_by: "admin-1",
            });
            clearProviderRequests(harness);
            const detailResponse = await harness.request("admin-1", "admin", "getProviderException", {
                id: String(first.id),
            });
            expect(detailResponse.status).toBe(200);
            expect(await responseBody(detailResponse)).toEqual(
                publicException({
                    ...first,
                    status: "resolved",
                    message: "Resolved after provider replay",
                    resolved_at: refreshedAt,
                    resolved_by: "admin-1",
                    updated_at: refreshedAt,
                }),
            );
            expect(postgrestTables(harness)).toEqual(["provider_exceptions"]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });

        test("preserves admin denials and exact missing-detail failures without provider calls", async () => {
            const harness = await createHarness();
            const denied = [
                ["listProviderRefunds", {}],
                ["getProviderRefund", { refundId: "404" }],
                ["listStripeDisputes", {}],
                ["getStripeDispute", { disputeId: "dp_missing" }],
                ["listFinancialOperations", {}],
                ["listProviderExceptions", {}],
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
            expect(postgrestTables(harness)).toEqual(["refunds", "rpc/read_dashboard_disputes", "provider_exceptions"]);
            expect(harness.rest.stripeRequests).toEqual([]);
        });
    });
}

function exceptionRow(key: string, message: string, at: string): JsonRecord {
    return {
        deduplication_key: key,
        payment_id: 10,
        operation_id: 20,
        exception_type: "provider_payment_truth_mismatch",
        severity: "critical",
        status: "open",
        message,
        details: { mismatch: "amount" },
        detected_at: at,
        resolved_at: at,
        resolved_by: "system",
    };
}

function publicException(row: JsonRecord): JsonRecord {
    return {
        id: row.id,
        deduplication_key: row.deduplication_key,
        payment_id: row.payment_id,
        operation_id: row.operation_id,
        exception_type: row.exception_type,
        severity: row.severity,
        status: row.status,
        message: row.message,
        details: row.details,
        detected_at: row.detected_at,
        resolved_at: row.resolved_at,
        resolved_by: row.resolved_by,
    };
}
