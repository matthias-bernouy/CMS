import { describe, expect, test } from "bun:test";
import { successfulJson, type CreateProviderReconciliationHarness, type JsonRecord } from "./harness";

const settingsKey = "platform-payout-settings-unavailable";
const scheduleKey = "platform-payout-schedule-drift";
const minimumKey = "platform-payout-minimum-drift";

export function registerProviderExceptionResolutionContracts(createHarness: CreateProviderReconciliationHarness): void {
    describe("stripe-connect provider reconciliation exception resolution", () => {
        test("resolves only active known exceptions with one filtered write each", async () => {
            const harness = await createHarness();
            harness.rest.seedProviderException(settingsKey, "open");
            harness.rest.seedProviderException(scheduleKey, "resolved");
            harness.rest.seedProviderException("unrelated-provider-exception", "open");
            harness.rest.clearPostgrestRequests();

            const result = await successfulJson(await harness.run("provider-exception-resolution-contract", 1));

            expect(result).toMatchObject({ status: "succeeded", exceptionCount: 0 });
            const exceptions = harness.rest.rows("provider_exceptions");
            const byKey = (key: string): JsonRecord => exceptions.find((row) => row.deduplication_key === key) ?? {};
            expect(byKey(settingsKey)).toMatchObject({
                status: "resolved",
                resolved_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
                resolved_by: "provider-reconciliation",
            });
            expect(byKey(scheduleKey)).toMatchObject({
                status: "resolved",
                resolved_at: "2026-07-06T12:06:00.000Z",
                resolved_by: "admin-contract",
            });
            expect(byKey(minimumKey)).toEqual({});
            expect(byKey("unrelated-provider-exception")).toMatchObject({
                status: "open",
                resolved_at: null,
                resolved_by: null,
            });

            const resolutionCalls = harness.rest.postgrestRequests.filter(
                (request) => request.table === "provider_exceptions",
            );
            expect(resolutionCalls).toHaveLength(3);
            expect(resolutionCalls.map((request) => request.method)).toEqual(["PATCH", "PATCH", "PATCH"]);
            expect(resolutionCalls.map((request) => Object.fromEntries(request.searchParams))).toEqual([
                { deduplication_key: `eq.${settingsKey}`, status: "neq.resolved" },
                { deduplication_key: `eq.${scheduleKey}`, status: "neq.resolved" },
                { deduplication_key: `eq.${minimumKey}`, status: "neq.resolved" },
            ]);
        });

        test("preserves fail-closed recovery when the filtered write fails", async () => {
            const harness = await createHarness();
            harness.rest.seedProviderException(settingsKey, "investigating");
            harness.rest.failNextProviderExceptionResolution();
            harness.rest.clearPostgrestRequests();

            const result = await successfulJson(await harness.run("provider-exception-resolution-failure", 1));

            expect(result).toMatchObject({ status: "manual_review", exceptionCount: 1 });
            expect(harness.rest.rows("provider_exceptions")).toContainEqual(
                expect.objectContaining({
                    deduplication_key: settingsKey,
                    status: "open",
                    message: "simulated provider exception resolution failure",
                    resolved_at: null,
                    resolved_by: null,
                }),
            );
            const resolutionCalls = harness.rest.postgrestRequests.filter(
                (request) => request.table === "provider_exceptions",
            );
            expect(resolutionCalls.map((request) => request.method)).toEqual(["PATCH", "POST"]);
            expect(resolutionCalls[0]?.body).toEqual({
                status: "resolved",
                resolved_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
                resolved_by: "provider-reconciliation",
            });
        });
    });
}
