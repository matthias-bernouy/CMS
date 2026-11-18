import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearPreparationTraces, clearTraceDirectory } from "./traces";

test("preparation trace cleanup preserves metadata and refuses every unexpected entry before any deletion", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-trace-window-"));
    const directory = join(root, "traces");
    const first = `${"a".repeat(64)}.ndjson`;
    const second = `${"b".repeat(64)}.ndjson`;
    try {
        await mkdir(directory);
        await writeFile(join(root, "metadata.ndjson"), "instrumentation remains healthy");
        await writeFile(join(directory, first), "unmeasured preparation");
        await writeFile(join(directory, second), "unmeasured verification");
        expect(clearTraceDirectory(directory)).toEqual({ removed: 2 });
        expect(await readdir(directory)).toEqual([]);
        expect(await readFile(join(root, "metadata.ndjson"), "utf8")).toBe("instrumentation remains healthy");
        await writeFile(join(directory, first), "preserved on refusal");
        await writeFile(join(directory, "unexpected"), "preserved");
        expect(() => clearTraceDirectory(directory)).toThrow("unexpected");
        expect(await readFile(join(directory, first), "utf8")).toBe("preserved on refusal");
        await rm(join(directory, "unexpected"));
        await symlink(join(root, "metadata.ndjson"), join(directory, second));
        expect(() => clearTraceDirectory(directory)).toThrow("unexpected");
        expect(await readFile(join(directory, first), "utf8")).toBe("preserved on refusal");
        await rm(join(directory, second));
        await mkdir(join(directory, second));
        expect(() => clearTraceDirectory(directory)).toThrow("unexpected");
        await symlink(directory, join(root, "linked-directory"));
        expect(() => clearTraceDirectory(join(root, "linked-directory"))).toThrow("real directory");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("the candidate cleanup program is self-contained and uses the same validated implementation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ulvia-trace-program-"));
    try {
        await writeFile(join(directory, `${"c".repeat(64)}.ndjson`), "owned trace");
        const program = `console.log(JSON.stringify((${clearTraceDirectory.toString()})(${JSON.stringify(directory)},require("node:fs"))))`;
        const child = Bun.spawn(["bun", "--no-macros", "-e", program], { stdout: "pipe", stderr: "pipe" });
        const [code, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ]);
        expect(stderr).toBe("");
        expect(code).toBe(0);
        expect(JSON.parse(stdout)).toEqual({ removed: 1 });
        expect(await readdir(directory)).toEqual([]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});

test("trace cleanup enforces file and container scope bounds before invoking destructive operations", async () => {
    let removed = 0;
    expect(() =>
        clearTraceDirectory("unit-only", {
            lstatSync: () => ({ isDirectory: () => true, isFile: () => true }),
            readdirSync: () => Array.from({ length: 100_001 }, () => `${"a".repeat(64)}.ndjson`),
            unlinkSync: () => {
                removed++;
            },
        }),
    ).toThrow("file budget");
    expect(removed).toBe(0);
    await expect(
        clearPreparationTraces({ id: "production", providerName: "production-provider", edgeName: "production-edge" }),
    ).rejects.toThrow("scope-refused");
});
