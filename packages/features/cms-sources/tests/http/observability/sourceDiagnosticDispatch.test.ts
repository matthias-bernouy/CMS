import { describe, expect, mock, test } from "bun:test";
import type { SourceRequestDiagnostic } from "@bernouy/cms-sources";
import {
    enqueueSourceDiagnostic,
    MAX_PENDING_SOURCE_DIAGNOSTICS,
    SOURCE_DIAGNOSTIC_REPORT_TIMEOUT_MS,
    sourceDiagnosticDispatchStats,
} from "cms-sources/core/execution/observability/sourceDiagnosticDispatch";
import { waitFor } from "./waitFor";

describe("source diagnostic dispatch", () => {
    test("defers reporters, bounds outstanding work, and continues after reporter failures", async () => {
        const before = sourceDiagnosticDispatchStats();
        let callCount = 0;
        const reporter = mock(() => {
            callCount += 1;
            if (callCount === 1) {
                throw new Error("synchronous logger failure");
            }
            if (callCount === 2) {
                return Promise.reject(new Error("asynchronous logger failure"));
            }
        });
        const event = diagnostic();
        const accepted = Array.from({ length: MAX_PENDING_SOURCE_DIAGNOSTICS + 32 }, () =>
            enqueueSourceDiagnostic(reporter, event),
        );

        expect(accepted.filter(Boolean)).toHaveLength(MAX_PENDING_SOURCE_DIAGNOSTICS);
        expect(accepted.filter((value) => !value)).toHaveLength(32);
        expect(reporter).not.toHaveBeenCalled();

        await waitFor(() => callCount === MAX_PENDING_SOURCE_DIAGNOSTICS);
        expect(reporter).toHaveBeenCalledTimes(MAX_PENDING_SOURCE_DIAGNOSTICS);
        expect(sourceDiagnosticDispatchStats()).toMatchObject({
            accepted: before.accepted + MAX_PENDING_SOURCE_DIAGNOSTICS,
            delivered: before.delivered + MAX_PENDING_SOURCE_DIAGNOSTICS - 2,
            failed: before.failed + 2,
            dropped: before.dropped + 34,
        });
    });

    test("temporarily disables a timed-out reporter and recovers when its sink settles", async () => {
        let releaseSlowReporter: (() => void) | undefined;
        const slowDelivery = new Promise<void>((resolve) => {
            releaseSlowReporter = resolve;
        });
        let slowCallCount = 0;
        const slow = mock(() => {
            slowCallCount += 1;
            return slowCallCount <= 4 ? slowDelivery : undefined;
        });
        const healthy = mock(() => undefined);
        const before = sourceDiagnosticDispatchStats();

        for (let index = 0; index < 4; index++) {
            expect(enqueueSourceDiagnostic(slow, diagnostic())).toBe(true);
        }
        expect(enqueueSourceDiagnostic(healthy, diagnostic())).toBe(true);
        await waitFor(() => healthy.mock.calls.length === 1, SOURCE_DIAGNOSTIC_REPORT_TIMEOUT_MS + 1_000);
        expect(enqueueSourceDiagnostic(slow, diagnostic())).toBe(false);
        expect(sourceDiagnosticDispatchStats()).toMatchObject({
            accepted: before.accepted + 5,
            delivered: before.delivered + 1,
            timedOut: before.timedOut + 4,
            dropped: before.dropped + 5,
        });

        releaseSlowReporter?.();
        await slowDelivery;
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(enqueueSourceDiagnostic(slow, diagnostic())).toBe(true);
        await waitFor(() => slow.mock.calls.length === 5);
        expect(sourceDiagnosticDispatchStats()).toMatchObject({
            accepted: before.accepted + 6,
            delivered: before.delivered + 2,
            timedOut: before.timedOut + 4,
            dropped: before.dropped + 5,
        });
    });
});

function diagnostic(): SourceRequestDiagnostic {
    return Object.freeze({
        observedAt: new Date("2026-07-24T00:00:00.000Z"),
        correlationId: "11d38c6a-0e6a-4f68-9dad-2a92c17b8300",
        endpointUrn: "urn:test:diagnostic",
        method: "GET",
        status: 500,
        outcome: "server_error",
        stagesMs: Object.freeze({ cms_total: 1 }),
        cohorts: Object.freeze(["forced"]),
    });
}
