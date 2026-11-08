import { expect, test } from "bun:test";
import { symlink, truncate, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { prepareResourceSource } from "@bernouy/resources/build";
import { sourceFixture } from "./fixtures";

test("resource source capture rejects symbolic entries and oversized regular files before compilation", async () => {
    const f = await sourceFixture();
    try {
        await symlink(join(f.root, "definition.json"), join(f.root, "symbolic.json"));
        await expect(prepareResourceSource(f.root, [])).rejects.toThrow("symbolic");
        const { unlink } = await import("node:fs/promises");
        await unlink(join(f.root, "symbolic.json"));
        await truncate(join(f.root, "definition.json"), 1024 * 1024 + 1);
        await expect(prepareResourceSource(f.root, [])).rejects.toThrow("file exceeds");
    } finally {
        await f.close();
    }
});

test("resource capture bounds traversal depth even for empty grouping directories", async () => {
    const f = await sourceFixture();
    try {
        await mkdir(join(f.root, ...Array.from({ length: 18 }, () => "deep")), { recursive: true });
        await expect(prepareResourceSource(f.root, [])).rejects.toThrow("depth");
    } finally {
        await f.close();
    }
});

test("source compilation refuses a process with macros enabled before touching authored runtime code", async () => {
    const f = await sourceFixture();
    try {
        const child = Bun.spawn(
            [
                process.execPath,
                "-e",
                'import { prepareResourceSource } from "@bernouy/resources/build"; await prepareResourceSource(process.argv[1], []);',
                f.root,
            ],
            { cwd: join(import.meta.dir, "../.."), stdout: "pipe", stderr: "pipe" },
        );
        const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
        expect(code).not.toBe(0);
        expect(error).toContain("--no-macros");
    } finally {
        await f.close();
    }
});

test("even explicit authored macro imports cannot execute under the required compilation flag", async () => {
    const f = await sourceFixture();
    try {
        const marker = join(f.root, "macro-executed.txt");
        await f.write(
            f.folder + "bloc.ts",
            'import { hit } from "./runtime/macro.ts" with { type: "macro" }; const value = hit(); export function mount() { return value; }',
        );
        await f.write(
            f.folder + "runtime/macro.ts",
            `export function hit() { require("node:fs").writeFileSync(${JSON.stringify(marker)}, "executed"); return 1; }`,
        );
        await expect(prepareResourceSource(f.root, [])).rejects.toThrow();
        expect(await Bun.file(marker).exists()).toBe(false);
    } finally {
        await f.close();
    }
});
