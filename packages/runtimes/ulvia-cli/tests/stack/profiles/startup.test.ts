import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("help, version and local instance listing do not initialize authoring or publication modules", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-cli-startup-"));
    const entry = new URL("../../../src/cli.ts", import.meta.url).href;
    const script = String.raw`
        const { runCli } = await import(${JSON.stringify(entry)});
        const options = { environment: { ULVIA_DATA_DIR: Bun.argv.at(-1) }, log() {} };
        await runCli(["--help"], options);
        await runCli(["--version"], options);
        await runCli(["instance", "list"], options);
        console.log(JSON.stringify(Object.keys(require.cache).filter(path =>
            /repository\/src\/collections\/|ulvia-cli\/src\/commands\/(release|remote)\//.test(path))));
    `;
    try {
        const child = Bun.spawn([process.execPath, "--eval", script, root], { stdout: "pipe", stderr: "pipe" });
        const [exit, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ]);
        expect(stderr).toBe("");
        expect(exit).toBe(0);
        expect(JSON.parse(stdout)).toEqual([]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
