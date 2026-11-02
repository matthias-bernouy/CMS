import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documentationChildren } from "./processes";

test("process outcomes retain an earlier crash without attributing its silent log to the next generation", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-process-outcomes-"));
    const processes = documentationChildren(root, process.cwd());
    try {
        const first = processes.start("provider", [
            process.execPath,
            "-e",
            'process.stderr.write("Bun has crashed\\n"); process.exitCode = 1;',
        ]);
        await first.exited;
        await processes.stop(first);
        const second = processes.start("provider", [process.execPath, "-e", ""]);
        await second.exited;
        await processes.stop(second);
        await processes.close();
        expect(processes.outcomes()).toHaveLength(2);
        expect(processes.outcomes()[0]).toMatchObject({ exitCode: 1, nativeCrash: true });
        expect(processes.outcomes()[0]?.diagnostic).toContain("Bun has crashed");
        expect(processes.outcomes()[1]).toMatchObject({ exitCode: 0, nativeCrash: false });
        expect(await Bun.file(join(root, "provider.errors.log")).text()).toBe("");
    } finally {
        await processes.close();
        await rm(root, { recursive: true, force: true });
    }
});
