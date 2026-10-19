import { expect, spyOn, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeLogger, isLogFormat, parseLogFormat } from "@bernouy/logging/node";

test("the Node logger writes private bounded NDJSON journals", async () => {
    const root = await mkdtemp(join(tmpdir(), "logging-node-"));
    const file = join(root, "service.ndjson");
    try {
        const logger = createNodeLogger({
            service: "test-service",
            file,
            mirror: false,
            maxFileBytes: 150,
            retainedFiles: 2,
        });
        logger.info("first.event", { value: "a".repeat(100) });
        logger.info("second.event", { value: "b".repeat(100) });

        expect((await stat(file)).mode & 0o777).toBe(0o600);
        expect(await readFile(`${file}.1`, "utf8")).toContain("first.event");
        expect(await readFile(file, "utf8")).toContain("second.event");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("log format parsing honors explicit values and safe fallbacks", () => {
    expect(isLogFormat("json")).toBe(true);
    expect(isLogFormat("unknown")).toBe(false);
    expect(parseLogFormat("json", "pretty")).toBe("json");
    expect(parseLogFormat("pretty", "json")).toBe("pretty");
    expect(parseLogFormat("unknown", "json")).toBe("json");
});

test("file and terminal destinations use independent thresholds", async () => {
    const root = await mkdtemp(join(tmpdir(), "logging-node-thresholds-"));
    const file = join(root, "service.ndjson");
    const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
        const logger = createNodeLogger({
            service: "test-service",
            level: "debug",
            file,
            fileLevel: "debug",
            mirrorLevel: "info",
            format: "json",
        });
        logger.debug("debug.detail");
        logger.info("visible.summary");

        const journal = await readFile(file, "utf8");
        expect(journal).toContain("debug.detail");
        expect(journal).toContain("visible.summary");
        expect(stdout).toHaveBeenCalledTimes(1);
        expect(String(stdout.mock.calls[0]?.[0])).toContain("visible.summary");
    } finally {
        stdout.mockRestore();
        await rm(root, { recursive: true, force: true });
    }
});

test("records rejected by every destination are disabled before serialization", () => {
    const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
        const logger = createNodeLogger({
            service: "test-service",
            mirrorLevel: "info",
            format: "json",
        });

        expect(logger.isEnabled("debug")).toBe(false);
        logger.debug("discarded.detail", { circular: globalThis });
        expect(stdout).not.toHaveBeenCalled();
    } finally {
        stdout.mockRestore();
    }
});

test("the Node logger rejects unbounded file-retention settings", () => {
    expect(() => createNodeLogger({ service: "test", maxFileBytes: 0 })).toThrow("positive safe integer");
    expect(() => createNodeLogger({ service: "test", retainedFiles: 0 })).toThrow("positive safe integer");
});

test("a failed file destination does not suppress the mirrored record", async () => {
    const root = await mkdtemp(join(tmpdir(), "logging-node-failure-"));
    const file = join(root, "service.ndjson");
    const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
        const logger = createNodeLogger({ service: "test-service", file, format: "json" });
        await rm(file);
        await mkdir(file);

        expect(() => logger.info("application.continues", { safe: true })).not.toThrow();
        expect(stdout).toHaveBeenCalledTimes(1);
        expect(String(stdout.mock.calls[0]?.[0])).toContain('"event":"application.continues"');
        expect(stderr).toHaveBeenCalledTimes(1);
        expect(String(stderr.mock.calls[0]?.[0])).toContain('"event":"logging.file.failed"');
    } finally {
        stdout.mockRestore();
        stderr.mockRestore();
        await rm(root, { recursive: true, force: true });
    }
});

test("an unavailable file destination does not prevent logger creation", async () => {
    const root = await mkdtemp(join(tmpdir(), "logging-node-unavailable-"));
    const blocker = join(root, "not-a-directory");
    const stdout = spyOn(process.stdout, "write").mockImplementation(() => true);
    const stderr = spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
        await writeFile(blocker, "occupied");

        const logger = createNodeLogger({
            service: "test-service",
            file: join(blocker, "service.ndjson"),
            format: "json",
        });
        expect(() => logger.info("application.started")).not.toThrow();

        expect(stderr).toHaveBeenCalledTimes(1);
        expect(String(stderr.mock.calls[0]?.[0])).toContain('"event":"logging.file.failed"');
        expect(stdout).toHaveBeenCalledTimes(1);
        expect(String(stdout.mock.calls[0]?.[0])).toContain('"event":"application.started"');
    } finally {
        stdout.mockRestore();
        stderr.mockRestore();
        await rm(root, { recursive: true, force: true });
    }
});
