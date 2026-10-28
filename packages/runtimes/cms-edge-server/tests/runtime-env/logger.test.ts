import { expect, spyOn, test } from "bun:test";
import { createEdgeDiagnostics } from "../../src/runtime/diagnostics";

test("Edge diagnostics preserve sanitized failures before a contract destination is available", async () => {
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
        const diagnostics = createEdgeDiagnostics({ MODE: "PROD" });
        diagnostics.logger.error("edge.operation.failed", { password: "private-value" }, new Error("operation failed"));
        const output = String(stderr.mock.calls[0]?.[0]);
        expect(output).not.toContain("private-value");
        expect(JSON.parse(output).error.stack).toContain("operation failed");
        expect(diagnostics.collector.stats().queued).toBe(1);
        await diagnostics.collector.close();
    } finally {
        stderr.mockRestore();
    }
});
