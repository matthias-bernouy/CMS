import { expect, spyOn, test } from "bun:test";
import { createNodeLogger, createNodeLogSink } from "@bernouy/logging/node";

test("operator diagnostics route structured redacted records to stdout and stderr", () => {
    const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
        const logger = createNodeLogger({ service: "operator", level: "info" });
        logger.debug("hidden.detail");
        logger.info("service.ready", { token: "private-value", count: 2 });
        logger.warn("service.warning");
        logger.error("service.failed", {}, new Error("safe failure"));
        expect(logger.isEnabled("debug")).toBe(false);
        expect(stdout).toHaveBeenCalledTimes(2);
        expect(stderr).toHaveBeenCalledTimes(1);
        const records = stdout.mock.calls.map((call) => JSON.parse(String(call[0])));
        expect(records[0]).toMatchObject({ service: "operator", event: "service.ready", attributes: { count: 2 } });
        expect(JSON.stringify(records)).not.toContain("private-value");
        expect(JSON.parse(String(stderr.mock.calls[0]![0]))).toMatchObject({
            event: "service.failed",
            error: { name: "Error" },
        });
    } finally {
        stdout.mockRestore();
        stderr.mockRestore();
    }
});

test("collector fallback sinks honor their threshold without a second logger", () => {
    const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
        const sink = createNodeLogSink({ service: "operator", level: "warn" });
        const record = {
            time: new Date().toISOString(),
            service: "collector",
            event: "delivery.failed",
            level: "info" as const,
        };
        sink(record);
        sink({ ...record, level: "warn" });
        sink({ ...record, level: "fatal" });
        expect(stdout).toHaveBeenCalledTimes(1);
        expect(stderr).toHaveBeenCalledTimes(1);
    } finally {
        stdout.mockRestore();
        stderr.mockRestore();
    }
});

test("pretty operator output escapes injected lines while preserving diagnostic stacks", () => {
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
        const logger = createNodeLogger({ service: "operator", format: "pretty", includeErrorStack: true });
        const error = new Error("message\nspoofed entry");
        error.stack = "Error: safe\n    at operation\u001b[31m";
        logger.error("service.failed", { count: 2 }, error);
        const output = String(stderr.mock.calls[0]![0]);
        expect(output).toContain("operator service.failed");
        expect(output).not.toContain("message\nspoofed entry");
        expect(output).toContain("\n    at operation");
        expect(output).not.toContain("\u001b");
    } finally {
        stderr.mockRestore();
    }
});

test("closed operator streams cannot fail an application operation", () => {
    const stdout = spyOn(process.stdout, "write").mockImplementation(() => {
        throw new Error("closed stdout");
    });
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => {
        throw new Error("closed stderr");
    });
    try {
        const logger = createNodeLogger({ service: "operator" });
        expect(() => logger.info("service.ready")).not.toThrow();
        expect(() => logger.error("service.failed")).not.toThrow();
    } finally {
        stdout.mockRestore();
        stderr.mockRestore();
    }
});
