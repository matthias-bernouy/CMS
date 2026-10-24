import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cleanWorkspaceBuildOutputs } from "../clean";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("workspace build cleanup", () => {
    test("removes only build outputs from real workspace packages", async () => {
        const root = await mkdtemp(join(tmpdir(), "cms-clean-"));
        temporaryRoots.push(root);
        const packageRoot = join(root, "packages/features/example");
        const nonPackageRoot = join(root, "packages/features/notes");
        await mkdir(join(packageRoot, "dist/nested"), { recursive: true });
        await mkdir(join(nonPackageRoot, "dist"), { recursive: true });
        await Promise.all([
            writeFile(join(packageRoot, "package.json"), "{}"),
            writeFile(join(packageRoot, "dist/nested/output.js"), "generated"),
            writeFile(join(packageRoot, "tsconfig.tsbuildinfo"), "generated"),
            writeFile(join(packageRoot, "source.ts"), "export {};"),
            writeFile(join(nonPackageRoot, "dist/keep.js"), "keep"),
        ]);

        await cleanWorkspaceBuildOutputs(root);

        expect(await Bun.file(join(packageRoot, "dist/nested/output.js")).exists()).toBeFalse();
        expect(await Bun.file(join(packageRoot, "tsconfig.tsbuildinfo")).exists()).toBeFalse();
        expect(await Bun.file(join(packageRoot, "source.ts")).exists()).toBeTrue();
        expect(await Bun.file(join(nonPackageRoot, "dist/keep.js")).exists()).toBeTrue();
    });
});
