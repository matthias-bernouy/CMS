import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("the official runtime bundle starts from generated metadata without source compiler or documentation directories", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-feature-runtime-"));
    try {
        const entry = join(root, "entry.ts");
        const module = resolve(import.meta.dir, "../../../src/capabilities/features/index.ts");
        await writeFile(
            entry,
            `import { loadOfficialFeatures } from ${JSON.stringify(module)};
const runtime = await loadOfficialFeatures();
console.log(JSON.stringify(runtime.implementations.map(({contractId}) => contractId).sort()));
`,
        );
        const destination = join(root, "runtime");
        await mkdir(destination);
        const outfile = join(destination, "index.mjs");
        const built = await Bun.build({ entrypoints: [entry], target: "bun", format: "esm", metafile: true });
        expect(built.success, JSON.stringify(built.logs)).toBe(true);
        await Bun.write(outfile, built.outputs[0]!);
        expect(built.metafile).toBeDefined();
        const inputs = Object.keys(built.metafile!.inputs);
        for (const forbidden of [
            "sdk/src/compiler/contracts.ts",
            "sdk/src/compiler/contracts/documentDirectory.ts",
            "sdk/src/compiler/implementations/index.ts",
        ]) {
            expect(inputs.some((path) => path.endsWith(forbidden))).toBe(false);
        }
        expect(inputs.some((path) => path.endsWith("features/generated/runtime.json"))).toBe(true);
        await expect(stat(join(root, "docs"))).rejects.toMatchObject({ code: "ENOENT" });
        const child = Bun.spawn([process.execPath, "--no-macros", outfile], {
            cwd: destination,
            stdout: "pipe",
            stderr: "pipe",
        });
        const [code, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ]);
        expect(stderr).toBe("");
        expect(code).toBe(0);
        expect(JSON.parse(stdout)).toEqual([
            "ulvia/cms.access",
            "ulvia/cms.authoring",
            "ulvia/cms.content",
            "ulvia/cms.emailer.smtp",
            "ulvia/cms.files",
            "ulvia/cms.observability",
            "ulvia/cms.secrets",
            "ulvia/provider.connections",
        ]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
