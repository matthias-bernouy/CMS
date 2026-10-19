import { expect, test } from "bun:test";
import { appendFile, mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDevLogRecords, showDevLogs, type DevLogCursor } from "../../src/runtime/dev/logs";
import { resolveUlviaPaths } from "../../src/runtime/paths";

test("development logs merge services and filter levels and request ids", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-dev-logs-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    const requestId = "11d38c6a-0e6a-4f68-9dad-2a92c17b8300";
    try {
        await mkdir(paths.logs, { recursive: true });
        await writeFile(
            join(paths.logs, "kernel.ndjson"),
            `${JSON.stringify(record("2026-01-01T00:00:02.000Z", "debug", "cms-kernel", "later"))}\n${JSON.stringify(
                record("2026-01-01T00:00:01.000Z", "error", "cms-kernel", "matched", requestId),
            )}\n`,
        );
        await writeFile(
            join(paths.logs, "provider.ndjson"),
            `${JSON.stringify(record("2026-01-01T00:00:00.000Z", "error", "ulvia-provider", "other"))}\n`,
        );
        const output: string[] = [];

        await showDevLogs(["all", "--level", "warn", "--request-id", requestId], paths, (line) => output.push(line));

        expect(output).toHaveLength(1);
        expect(output[0]).toContain("cms-kernel matched");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("development logs support exact event and instance filters plus JSON and opt-in stacks", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-dev-logs-formats-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    const instanceId = "11d38c6a-0e6a-4f68-9dad-2a92c17b8300";
    const entry = {
        ...record("2026-01-01T00:00:00.000Z", "error", "ulvia-provider", "provider.operation.failed"),
        attributes: { instanceId },
        error: { name: "Error", message: "failed", stack: "Error: failed\n    at operation.ts:1:1" },
    };
    try {
        await mkdir(paths.logs, { recursive: true });
        await writeFile(join(paths.logs, "provider.ndjson"), `${JSON.stringify(entry)}\n`);
        const pretty: string[] = [];
        const json: string[] = [];

        await showDevLogs(
            ["provider", "--event", "provider.operation.failed", "--instance-id", instanceId, "--stack"],
            paths,
            (line) => pretty.push(line),
        );
        await showDevLogs(["provider", "--json"], paths, (line) => json.push(line));

        expect(pretty[0]).toContain("operation.ts:1:1");
        expect(JSON.parse(json[0] ?? "")).toEqual(entry);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("development logs include retained rotated journals", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-dev-logs-rotated-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    try {
        await mkdir(paths.logs, { recursive: true });
        await writeFile(
            join(paths.logs, "kernel.ndjson.1"),
            `${JSON.stringify(record("2026-01-01T00:00:00.000Z", "error", "cms-kernel", "before.rotation"))}\n`,
        );
        await writeFile(
            join(paths.logs, "kernel.ndjson"),
            `${JSON.stringify(record("2026-01-01T00:00:01.000Z", "error", "cms-kernel", "after.rotation"))}\n`,
        );
        const output: string[] = [];

        await showDevLogs(["kernel"], paths, (line) => output.push(line));

        expect(output.map((line) => line.split(" ").at(-1))).toEqual(["before.rotation", "after.rotation"]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("development log cursors preserve partial records and follow rotated inodes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-dev-logs-follow-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    const cursor: DevLogCursor = new Map();
    const file = join(paths.logs, "provider.ndjson");
    const first = JSON.stringify(record("2026-01-01T00:00:00.000Z", "error", "ulvia-provider", "first"));
    const second = JSON.stringify(record("2026-01-01T00:00:01.000Z", "error", "ulvia-provider", "second"));
    try {
        await mkdir(paths.logs, { recursive: true });
        await writeFile(file, first.slice(0, 20));
        expect(await readDevLogRecords(paths, ["provider"], cursor)).toEqual([]);

        await appendFile(file, `${first.slice(20)}\n`);
        expect((await readDevLogRecords(paths, ["provider"], cursor)).map(({ event }) => event)).toEqual(["first"]);

        await rename(file, `${file}.1`);
        await writeFile(file, `${second}\n`);
        expect((await readDevLogRecords(paths, ["provider"], cursor)).map(({ event }) => event)).toEqual(["second"]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("development logs report malformed journal records without exposing their content", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-dev-logs-malformed-"));
    const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: root });
    const cursor: DevLogCursor = new Map();
    try {
        await mkdir(paths.logs, { recursive: true });
        await writeFile(join(paths.logs, "kernel.ndjson"), "not-json-with-a-private-value\n");

        const records = await readDevLogRecords(paths, ["kernel"], cursor);
        expect(records).toEqual([
            expect.objectContaining({
                level: "warn",
                service: "ulvia-dev",
                event: "logging.journal.invalid-record",
                attributes: { journal: "kernel.ndjson", invalidRecords: 1 },
            }),
        ]);
        expect(JSON.stringify(records)).not.toContain("private-value");
        expect(await readDevLogRecords(paths, ["kernel"], cursor)).toEqual([]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

function record(time: string, level: "debug" | "error", service: string, event: string, requestId?: string) {
    return { time, level, service, event, ...(requestId ? { attributes: { requestId } } : {}) };
}
