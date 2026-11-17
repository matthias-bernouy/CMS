import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reportFixture } from "../fixtures/report";
import { readRun, writeRun } from "./history";

test("failed runs remain immutable, independently readable and never overwrite earlier evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-perf-history-"));
    try {
        const report = await reportFixture();
        const path = await writeRun(root, report);
        expect((await readRun(root, report.metadata.id)).status).toBe("failed");
        const before = await readFile(join(path, "results.json"));
        await expect(writeRun(root, { ...report, status: "passed" })).rejects.toThrow();
        expect(await readFile(join(path, "results.json"))).toEqual(before);
        const second = { ...report, metadata: { ...report.metadata, id: "20261117T120100Z-1234567-abcdef13" } };
        await writeRun(root, second);
        expect((await readRun(root, report.metadata.id)).metadata.id).toBe(report.metadata.id);
        expect((await readRun(root, second.metadata.id)).metadata.id).toBe(second.metadata.id);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("incomplete reports, modified bytes, symbolic files and traversal cannot become references", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-perf-history-refusal-"));
    try {
        const report = await reportFixture();
        const path = await writeRun(root, report);
        await writeFile(join(path, "results.json"), "{}");
        await expect(readRun(root, report.metadata.id)).rejects.toThrow("integrity");
        await unlink(join(path, "results.json"));
        const external = join(root, "external.json");
        await writeFile(external, JSON.stringify(report));
        await symlink(external, join(path, "results.json"));
        await expect(readRun(root, report.metadata.id)).rejects.toThrow("regular file");
        await unlink(join(path, "complete.json"));
        await expect(readRun(root, report.metadata.id)).rejects.toThrow();
        await expect(readRun(root, "../external.json")).rejects.toThrow("run ID");
        expect(await readFile(external, "utf8")).toBe(JSON.stringify(report));
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
