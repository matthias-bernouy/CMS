import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beginSupplementary, readSupplementary, writeSupplementary } from "./supplementary";

test("supplementary evidence retains failures immutably and escapes HTML without claiming capability coverage", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-performance-supplementary-"));
    try {
        const start = await beginSupplementary("benchmarks");
        const results = {
            stages: [{ name: "bounded group", status: "failed" }],
            diagnostic: "<script>unsafe</script>",
        };
        const path = await writeSupplementary(start, results, "failed", root);
        expect((await readSupplementary(root, start.metadata.id)).results).toEqual(results);
        const html = await readFile(join(path, "report.html"), "utf8");
        expect(html).toContain("&lt;script&gt;");
        expect(html).not.toContain("<script>unsafe");
        expect(html).toContain("no capability coverage credit");
        await expect(writeSupplementary(start, {}, "passed", root)).rejects.toThrow();
        await writeFile(join(path, "results.json"), "{}");
        await expect(readSupplementary(root, start.metadata.id)).rejects.toThrow("integrity mismatch");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("incomplete, symbolic, invalid-path and non-finite supplementary artifacts are rejected", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-performance-supplementary-"));
    try {
        const start = await beginSupplementary("delivery");
        await expect(writeSupplementary(start, { latency: Number.NaN }, "passed", root)).rejects.toThrow("Non-finite");
        await expect(readSupplementary(root, "../outside")).rejects.toThrow("Invalid supplementary run ID");
        const path = await writeSupplementary(start, { requests: 10 }, "passed", root);
        await rm(join(path, "complete.json"));
        await expect(readSupplementary(root, start.metadata.id)).rejects.toThrow();
        await symlink(join(path, "results.json"), join(path, "complete.json"));
        await expect(readSupplementary(root, start.metadata.id)).rejects.toThrow();
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
