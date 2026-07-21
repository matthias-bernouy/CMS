import { describe, expect, test } from "bun:test";
import { DEV_SYSTEM_FUNCTION_JOBS } from "../../src/dev-server/systemFunctionWorkers";

describe("p9r dev system function workers", () => {
    test("matches the production protected-commerce worker set", () => {
        expect(DEV_SYSTEM_FUNCTION_JOBS.map((job) => job.functionId)).toEqual([
            "reconcileProtectedPaymentSystems",
            "processDueOrderDeadlines",
            "dispatchPendingPaymentCancellations",
            "dispatchPendingProtectedRefunds",
            "dispatchDueProtectedSettlements",
            "reconcileMondialRelayShipmentOperations",
            "reconcileMondialRelayFulfillments",
            "publishMondialRelayDeliveryHealth",
        ]);
        expect(DEV_SYSTEM_FUNCTION_JOBS.every((job) => job.intervalMs >= 15_000)).toBe(true);
        const reconciliation = DEV_SYSTEM_FUNCTION_JOBS.find(
            (job) => job.functionId === "reconcileProtectedPaymentSystems",
        );
        expect(
            (
                reconciliation?.body({
                    functionId: "reconcileProtectedPaymentSystems",
                    runId: "budget",
                    sequence: 1,
                    startedAt: "2026-07-13T00:00:00.000Z",
                }) as { limit: number }
            ).limit,
        ).toBe(5);
        expect(reconciliation?.intervalMs).toBe(15_000);
    });
});
