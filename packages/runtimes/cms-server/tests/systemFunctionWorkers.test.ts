import { describe, expect, test } from "bun:test";
import { PRODUCTION_SYSTEM_FUNCTION_JOBS } from "../src/systemFunctionWorkers";

describe("production system function workers", () => {
    test("schedules every protected-commerce recovery path with bounded batches", () => {
        expect(PRODUCTION_SYSTEM_FUNCTION_JOBS.map((job) => job.functionId)).toEqual([
            "reconcileProtectedPaymentSystems",
            "processDueOrderDeadlines",
            "dispatchPendingPaymentCancellations",
            "dispatchPendingProtectedRefunds",
            "dispatchDueProtectedSettlements",
            "reconcileMondialRelayShipmentOperations",
            "reconcileMondialRelayFulfillments",
            "publishMondialRelayDeliveryHealth",
        ]);
        for (const job of PRODUCTION_SYSTEM_FUNCTION_JOBS) {
            expect(
                job.body({
                    functionId: job.functionId,
                    runId: "run-id",
                    sequence: 1,
                    startedAt: "2026-07-13T00:00:00.000Z",
                }),
            ).toEqual({
                runKey: `cms-runtime:${job.functionId}:2026-07-13T00:00:00.000Z:run-id`,
                limit:
                    job.functionId === "reconcileMondialRelayFulfillments"
                        ? 8
                        : job.functionId === "publishMondialRelayDeliveryHealth"
                          ? 24
                          : 5,
            });
        }
    });

    test("keeps provider batches below the 15 second upstream request budget", () => {
        for (const job of PRODUCTION_SYSTEM_FUNCTION_JOBS) {
            const limit = (
                job.body({
                    functionId: job.functionId,
                    runId: "run-id",
                    sequence: 1,
                    startedAt: "2026-07-13T00:00:00.000Z",
                }) as { limit: number }
            ).limit;
            expect(limit).toBe(
                job.functionId === "reconcileMondialRelayFulfillments"
                    ? 8
                    : job.functionId === "publishMondialRelayDeliveryHealth"
                      ? 24
                      : 5,
            );
        }
        expect(
            PRODUCTION_SYSTEM_FUNCTION_JOBS.find((job) => job.functionId === "reconcileMondialRelayFulfillments")
                ?.intervalMs,
        ).toBe(5 * 60_000);
        expect(
            PRODUCTION_SYSTEM_FUNCTION_JOBS.find((job) => job.functionId === "reconcileMondialRelayShipmentOperations")
                ?.intervalMs,
        ).toBe(60_000);
        expect(
            PRODUCTION_SYSTEM_FUNCTION_JOBS.find((job) => job.functionId === "dispatchPendingPaymentCancellations"),
        ).toMatchObject({ initialDelayMs: 15_000, intervalMs: 60_000 });
        expect(
            (
                PRODUCTION_SYSTEM_FUNCTION_JOBS.find(
                    (job) => job.functionId === "reconcileProtectedPaymentSystems",
                )?.body({
                    functionId: "reconcileProtectedPaymentSystems",
                    runId: "budget",
                    sequence: 1,
                    startedAt: "2026-07-13T00:00:00.000Z",
                }) as { limit: number }
            ).limit,
        ).toBe(5);
        expect(
            PRODUCTION_SYSTEM_FUNCTION_JOBS.find((job) => job.functionId === "reconcileProtectedPaymentSystems")
                ?.intervalMs,
        ).toBe(15_000);
    });

    test("drains a twenty-item Stripe reconciliation backlog within one minute of scheduled capacity", () => {
        const reconciliation = PRODUCTION_SYSTEM_FUNCTION_JOBS.find(
            (job) => job.functionId === "reconcileProtectedPaymentSystems",
        )!;
        const limit = (
            reconciliation.body({
                functionId: reconciliation.functionId,
                runId: "throughput",
                sequence: 1,
                startedAt: "2026-07-13T00:00:00.000Z",
            }) as { limit: number }
        ).limit;
        const backlog = 20;
        const drainMs = Math.ceil(backlog / limit) * reconciliation.intervalMs;
        expect(limit).toBe(5);
        expect(drainMs).toBeLessThanOrEqual(60_000);
    });
});
