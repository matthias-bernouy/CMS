import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beginProbeEpoch } from "./records";

test("runtime epochs discard unmeasured predecessor traces and reset global metadata without growing across restarts", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-probe-epoch-"));
    try {
        const file = join(root, "metadata.ndjson");
        const directory = join(root, "traces");
        await mkdir(directory);
        const sentinel = join(root, "outside-traces.txt");
        await writeFile(sentinel, "preserved");
        for (let epoch = 0; epoch < 3; epoch++) {
            await writeFile(file, "previous runtime metadata\n");
            await writeFile(join(directory, `preparation-${epoch}.ndjson`), "unmeasured preparation\n");
            beginProbeEpoch(file, directory);
            expect(await readFile(file, "utf8")).toBe("");
            expect(await readdir(directory)).toEqual([]);
            expect(await readFile(sentinel, "utf8")).toBe("preserved");
        }
    } finally {
        await rm(root, { force: true, recursive: true });
    }
});
