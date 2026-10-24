import { expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createKernelLogger } from "../../src/runtime/logger";

test("the development logger keeps debug noise out of the terminal by default", () => {
    const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
        const logger = createKernelLogger({ MODE: "DEV" });
        logger.debug("kernel.debug.detail");
        logger.info("kernel.visible.summary");

        expect(stdout).toHaveBeenCalledTimes(1);
        expect(String(stdout.mock.calls[0]?.[0])).toContain("kernel.visible.summary");
    } finally {
        stdout.mockRestore();
    }
});

test("invalid logging configuration is visible without echoing its value", () => {
    const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
        createKernelLogger({ MODE: "DEV", ULVIA_LOG_LEVEL: "private-level", ULVIA_LOG_FORMAT: "private-format" });

        const output = stdout.mock.calls.map((call) => String(call[0])).join("\n");
        expect(output.match(/logging\.configuration\.invalid/gu)).toHaveLength(2);
        expect(output).not.toContain("private-level");
        expect(output).not.toContain("private-format");
    } finally {
        stdout.mockRestore();
    }
});

test("production JSON failures retain their sanitized stack", () => {
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
        const logger = createKernelLogger({ MODE: "PROD" });
        logger.error("kernel.operation.failed", {}, new Error("operation failed"));

        const record = JSON.parse(String(stderr.mock.calls[0]?.[0])) as { error?: { stack?: string } };
        expect(record.error?.stack).toContain("operation failed");
    } finally {
        stderr.mockRestore();
    }
});

test("an explicitly configured production journal is retained for CLI-managed installations", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-production-journal-"));
    const file = join(root, "kernel.ndjson");
    const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
        const logger = createKernelLogger({ MODE: "PROD", ULVIA_LOG_FILE: file });
        logger.info("kernel.journal.visible");
        expect(await readFile(file, "utf8")).toContain("kernel.journal.visible");
    } finally {
        stdout.mockRestore();
        await rm(root, { recursive: true, force: true });
    }
});

test("development terminal verbosity is configured independently from the journal threshold", () => {
    const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
        const logger = createKernelLogger({
            MODE: "DEV",
            ULVIA_LOG_LEVEL: "trace",
            ULVIA_LOG_CONSOLE_LEVEL: "warn",
        });
        logger.info("kernel.hidden.summary");
        logger.warn("kernel.visible.warning");

        expect(stdout).toHaveBeenCalledTimes(1);
        expect(String(stdout.mock.calls[0]?.[0])).toContain("kernel.visible.warning");
    } finally {
        stdout.mockRestore();
    }
});
