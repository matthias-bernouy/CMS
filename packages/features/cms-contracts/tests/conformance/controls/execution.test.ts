import { describe, expect, test } from "bun:test";
import { DEFAULT_RELEASE_LIMITS } from "@bernouy/cms-contracts";
import { controls, operation, pagination, query, target } from "./fixtures";

const completion = { timeoutMs: 1000, pollIntervalMs: 100 };
const eventually = { maxAttempts: 3, intervalMs: 100 };

describe("declarative conformance execution controls", () => {
    test("keeps ordinary calls unchanged and permits logical keys only for keyed commands", () => {
        expect(controls()).toEqual({});
        expect(controls({ invocationKey: "delivery" })).toEqual({ invocationKey: "delivery" });
        expect(() => controls({ invocationKey: "delivery" }, query())).toThrow("only valid for keyed commands");
        for (const idempotency of ["none", "natural"]) {
            expect(() =>
                controls(
                    { invocationKey: "delivery" },
                    target({ behavior: { effect: "command", execution: "sync", idempotency } }),
                ),
            ).toThrow("only valid for keyed commands");
        }
    });

    test("requires an explicit key and success expectation for replay", () => {
        expect(controls({ invocationKey: "delivery", replayOf: "original" })).toEqual({
            invocationKey: "delivery",
            replayOf: "original",
        });
        expect(() => controls({ replayOf: "original" })).toThrow("explicit invocationKey and a success");
        expect(() =>
            controls({
                invocationKey: "delivery",
                replayOf: "original",
                expect: { kind: "error", code: "INVALID_RECIPIENT" },
            }),
        ).toThrow("explicit invocationKey and a success");
    });

    test("requires completion for operation success and distinguishes acceptance from final failure", () => {
        expect(() => controls({}, operation())).toThrow("operation success requires");
        expect(controls({ completion }, operation())).toEqual({ completion });
        const expectError = { kind: "error", code: "INVALID_RECIPIENT" };
        expect(controls({ expect: expectError }, operation())).toEqual({});
        expect(controls({ expect: expectError, completion }, operation())).toEqual({ completion });
        expect(() => controls({ completion })).toThrow("only valid for operations");
    });

    test.each([
        { timeoutMs: 0, pollIntervalMs: 1 },
        { timeoutMs: 1000, pollIntervalMs: 0 },
        { timeoutMs: 1000, pollIntervalMs: 1001 },
        { timeoutMs: 60_001, pollIntervalMs: 1000 },
        { timeoutMs: 1000, pollIntervalMs: 1 },
        { timeoutMs: 1000.1, pollIntervalMs: 100 },
        { timeoutMs: 1000, pollIntervalMs: 100, extra: true },
    ])("rejects unbounded or malformed completion: %j", (policy) => {
        expect(() => controls({ completion: policy }, operation())).toThrow();
    });

    test("counts the final clamped operation poll within custom attempt limits", () => {
        const limits = { ...DEFAULT_RELEASE_LIMITS, maxConformanceAttempts: 3, maxConformanceDurationMs: 1000 };
        expect(controls({ completion: { timeoutMs: 1000, pollIntervalMs: 400 } }, operation(), limits)).toHaveProperty(
            "completion",
        );
        expect(() => controls({ completion: { timeoutMs: 1000, pollIntervalMs: 300 } }, operation(), limits)).toThrow(
            "polling attempt limit",
        );
    });

    test("only repeats successful synchronous queries", () => {
        expect(controls({ eventually }, query())).toEqual({ eventually });
        expect(() => controls({ eventually })).toThrow("successful sync query");
        expect(() => controls({ eventually, completion }, operation())).toThrow("successful sync query");
        expect(() => controls({ eventually, expect: { kind: "error", code: "INVALID_RECIPIENT" } }, query())).toThrow(
            "successful sync query",
        );
        expect(() => controls({ eventually, pagination }, query())).toThrow("cannot be combined");
    });

    test.each([
        { maxAttempts: 0, intervalMs: 100 },
        { maxAttempts: 101, intervalMs: 100 },
        { maxAttempts: 3, intervalMs: 0 },
        { maxAttempts: 3, intervalMs: 30_001 },
        { maxAttempts: 1, intervalMs: 60_001 },
        { maxAttempts: 2, intervalMs: 10, extra: true },
    ])("rejects unbounded or malformed eventual queries: %j", (policy) => {
        expect(() => controls({ eventually: policy }, query())).toThrow();
    });

    test("bounds eventual waits after the immediate first attempt", () => {
        const limits = { ...DEFAULT_RELEASE_LIMITS, maxConformanceAttempts: 2, maxConformanceDurationMs: 100 };
        expect(controls({ eventually: { maxAttempts: 2, intervalMs: 100 } }, query(), limits)).toHaveProperty(
            "eventually",
        );
        expect(() => controls({ eventually }, query(), limits)).toThrow("between 1 and 2");
    });
});
