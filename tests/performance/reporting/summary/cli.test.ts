import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reportFixture } from "../../fixtures/report";
import { writeRun } from "../history";
import { writeLatencySummary } from "./cli";

test("portable summary preserves separate sealed runs and refuses corruption, symlinks and writing inside evidence", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-summary-"));
    try {
        const exports = join(root, "exports");
        const report = await reportFixture();
        const original = await writeRun(join(exports, report.metadata.id, "runs"), report);
        const second = {
            ...report,
            metadata: { ...report.metadata, id: "20261117T120100Z-1234567-abcdef13", sourceDigest: "a".repeat(64) },
            results: report.results.map((result) => ({
                ...result,
                measurements: result.measurements.map((sample) => ({ ...sample, durationMs: 1000 })),
            })),
        };
        await writeRun(join(exports, second.metadata.id, "runs"), second);
        const before = await readFile(join(original, "results.json"));
        const result = await writeLatencySummary(exports, join(root, "summaries"));
        const summary = JSON.parse(await readFile(join(result.directory, "latencies.json"), "utf8"));
        expect(summary.runs).toHaveLength(2);
        expect(summary.rows.map((row: { p95: number }) => row.p95)).toEqual([10, 1000]);
        for (const row of summary.rows) {
            expect(await readFile(join(result.directory, decodeURI(row.report)), "utf8")).toContain(
                "Ulvia performance assessment",
            );
        }
        expect(await readFile(join(original, "results.json"))).toEqual(before);
        await expect(writeLatencySummary(exports, join(exports, "derived"))).rejects.toThrow("outside immutable");
        const alias = "20261117T120200Z-1234567-abcdef14";
        await symlink(join(exports, report.metadata.id), join(exports, alias));
        await expect(writeLatencySummary(exports, join(root, "summaries"))).rejects.toThrow("real exported");
        await rm(join(exports, alias));
        await writeFile(join(original, "results.json"), "{}");
        await expect(writeLatencySummary(exports, join(root, "summaries"))).rejects.toThrow("integrity");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
