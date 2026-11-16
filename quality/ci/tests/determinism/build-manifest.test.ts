import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createBuildManifest } from "../../determinism/build-manifest";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("build manifest discovers current bundles and metadata under dist without requiring a source-tree bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "cmscore-build-manifest-"));
    temporaryRoots.push(root);
    const files = {
        "packages/features/example/dist/index.js": "export const value = 1;\n",
        "packages/features/example/tsconfig.tsbuildinfo": "build-state\n",
        "packages/features/content/dist/runtime-assets/bloc-runtime.js": "(() => {})();\n",
        "packages/features/content/dist/runtime-assets/binding-core.js": "(() => {})();\n",
        "packages/surfaces/ulvia-provider/dist/generated/runtime.json": "{}\n",
        "packages/runtimes/ulvia-cli/dist/types/bootstrap/generate.d.ts": "export {};\n",
        "packages/runtimes/ulvia-cli/dist/bootstrap/index.json": "{}\n",
    };
    for (const [path, contents] of Object.entries(files)) {
        const absolutePath = join(root, path);
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, contents);
    }
    const authoredScript = join(root, "packages/surfaces/cms-edge/src/http/setup/app.asset.js");
    await mkdir(dirname(authoredScript), { recursive: true });
    await writeFile(authoredScript, "export const authored = true;\n");

    const first = await createBuildManifest(root);
    const second = await createBuildManifest(root);
    expect(second).toEqual(first);
    expect(first.files.map((entry) => entry.path)).toEqual(Object.keys(files).sort());

    await writeFile(join(root, "packages/features/example/dist/index.js"), "export const value = 2;\n");
    const changed = await createBuildManifest(root);
    const changedPath = "packages/features/example/dist/index.js";
    expect(changed.files.find(({ path }) => path === changedPath)!.sha256).not.toBe(
        first.files.find(({ path }) => path === changedPath)!.sha256,
    );
});
