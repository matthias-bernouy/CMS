import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reportFixture } from "../../fixtures/report";
import { createCheckpoint } from "./checkpoint";
import { readRun } from "../history";

test("interrupted checkpoints retain completed raw results without becoming regression references", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-perf-checkpoint-"));
    try {
        const report = await reportFixture();
        const checkpoint = await createCheckpoint(root, report);
        await checkpoint.record(report.results[0]!);
        const raw = JSON.parse(await readFile(join(checkpoint.directory, "000001.json"), "utf8"));
        expect(raw).toEqual(report.results[0]);
        expect(JSON.parse(await readFile(join(checkpoint.directory, "header.json"), "utf8")).referenceEligible).toBe(
            false,
        );
        await expect(readFile(join(checkpoint.directory, "closed.json"))).rejects.toThrow();
        await expect(readRun(root, report.metadata.id)).rejects.toThrow();
        await expect(checkpoint.record(report.results[0]!)).rejects.toThrow("duplicate");
        expect(JSON.parse(await readFile(join(checkpoint.directory, "000001.json"), "utf8"))).toEqual(raw);
        await checkpoint.close("failed");
        expect(JSON.parse(await readFile(join(checkpoint.directory, "closed.json"), "utf8")).recorded).toBe(1);
        await expect(checkpoint.record(report.results[0]!)).rejects.toThrow("closed");
        await expect(createCheckpoint(root, report)).rejects.toThrow();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
