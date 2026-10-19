import { describe, expect, test } from "bun:test";
import { createLogger } from "@bernouy/logging";
import { createMemoryLogger } from "@bernouy/logging/testing";

describe("structured diagnostics", () => {
    test("filters levels and preserves child context", () => {
        const memory = createMemoryLogger({ service: "kernel", level: "info", now: () => new Date(0) });
        const request = memory.logger.child({ requestId: "request-1" });
        request.debug("request.debug");
        request.info("request.completed", { status: 200 });

        expect(memory.records).toEqual([
            {
                time: "1970-01-01T00:00:00.000Z",
                level: "info",
                service: "kernel",
                event: "request.completed",
                attributes: { requestId: "request-1", status: 200 },
            },
        ]);
    });

    test("reads authoritative dynamic context when each record is emitted", () => {
        let requestId: string | undefined;
        const memory = createMemoryLogger({
            service: "kernel",
            context: () => (requestId ? { requestId } : undefined),
        });

        memory.logger.info("outside.request", { requestId: "spoofed" });
        requestId = "request-2";
        memory.logger.child({ component: "pages" }).info("inside.request", { requestId: "spoofed" });

        expect(memory.records[0]?.attributes).toEqual({ requestId: "spoofed" });
        expect(memory.records[1]?.attributes).toEqual({
            requestId: "request-2",
            component: "pages",
        });
    });

    test("never lets a failing context provider break application logging", () => {
        const memory = createMemoryLogger({
            service: "kernel",
            context: () => {
                throw new Error("context unavailable");
            },
        });

        expect(() => memory.logger.info("request.completed")).not.toThrow();
        expect(memory.records).toHaveLength(1);
    });

    test("never lets a failing destination break application behavior", () => {
        const logger = createLogger({
            service: "kernel",
            sink: () => {
                throw new Error("disk unavailable");
            },
        });

        expect(() => logger.error("request.failed")).not.toThrow();
    });

    test("redacts secrets and URL credentials centrally", () => {
        const memory = createMemoryLogger({ service: "provider" });
        memory.logger.error(
            "request.failed",
            {
                authorization: "Bearer raw-secret",
                nested: { sessionToken: "raw-token", safe: "kept" },
                url: "https://user:pass@example.test/path?token=secret#fragment",
                detail: 'request to https://user:pass@example.test/path?token=secret failed with {"apiKey":"raw"}',
            },
            new TypeError("failed with Bearer abc.def and password=hunter2"),
        );

        expect(memory.records[0]?.attributes).toEqual({
            authorization: "[REDACTED]",
            nested: { sessionToken: "[REDACTED]", safe: "kept" },
            url: "https://example.test/path",
            detail: 'request to https://example.test/path failed with {"apiKey":"[REDACTED]"}',
        });
        expect(memory.records[0]?.error).toEqual({
            name: "TypeError",
            message: "failed with Bearer [REDACTED] and password=[REDACTED]",
        });
    });

    test("bounds the complete attribute graph and handles cycles", () => {
        const memory = createMemoryLogger({ service: "provider" });
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        const wide = Object.fromEntries(
            Array.from({ length: 1_000 }, (_, index) => [`value-${index}`, "x".repeat(2_048)]),
        );

        expect(() => memory.logger.info("bounded.record", { cyclic, wide })).not.toThrow();

        const serialized = JSON.stringify(memory.records[0]);
        expect(serialized).toContain("[CIRCULAR]");
        expect(serialized.length).toBeLessThan(70_000);
        expect(Object.keys((memory.records[0]?.attributes?.wide ?? {}) as object).length).toBeLessThanOrEqual(32);
    });

    test("rejects unstable service names without letting invalid events interrupt the application", () => {
        expect(() => createMemoryLogger({ service: "CMS Kernel" })).toThrow();
        const memory = createMemoryLogger({ service: "kernel" });
        expect(() => memory.logger.info("A sentence with spaces", { safe: true })).not.toThrow();
        expect(memory.records[0]).toMatchObject({
            event: "logging.invalid-event",
            attributes: { invalidEvent: "A sentence with spaces", safe: true },
        });
    });
});
