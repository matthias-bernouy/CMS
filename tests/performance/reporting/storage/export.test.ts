import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reportFixture } from "../../fixtures/report";
import { compareReports } from "../compare";
import { readRun, writeRun } from "../history";
import { exportRun, historyIndex, referenceDigest } from "./export";

test("portable history exports preserve exact seals and comparisons without overwriting shared references", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-perf-portable-"));
    try {
        const source = join(root, "source");
        const destination = join(root, "shared");
        const report = await reportFixture();
        const comparison = compareReports(report, report);
        const path = await writeRun(source, report, comparison);
        const digest = await referenceDigest(source, report.metadata.id);
        const exported = await exportRun(source, report.metadata.id, destination);
        expect(await readFile(join(exported, "results.json"))).toEqual(await readFile(join(path, "results.json")));
        expect(await referenceDigest(destination, report.metadata.id)).toBe(digest);
        expect((await readRun(destination, report.metadata.id)).metadata.id).toBe(report.metadata.id);
        expect(await historyIndex(destination)).toHaveLength(1);
        await expect(exportRun(source, report.metadata.id, destination)).rejects.toThrow();
        await writeFile(join(exported, "comparison.json"), "{}");
        await expect(readRun(destination, report.metadata.id)).rejects.toThrow("comparison integrity");
        expect((await historyIndex(destination))[0]?.status).toBe("incomplete-or-corrupt");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
