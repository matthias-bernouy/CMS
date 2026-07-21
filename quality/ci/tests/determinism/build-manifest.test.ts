import { afterEach, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { createBuildManifest } from "../../determinism/build-manifest";

const temporaryRoots: string[] = [];

afterEach(async () => {
    await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test("build manifest is stable and covers every shipped generated output", async () => {
    const root = await mkdtemp(join(tmpdir(), "cmscore-build-manifest-"));
    temporaryRoots.push(root);
    const files = {
        "packages/features/example/dist/index.js": "export const value = 1;\n",
        "packages/features/example/tsconfig.tsbuildinfo": "build-state\n",
        "packages/surfaces/cms-control/src/static/assets/control-components.js": "(() => {})();\n",
    };
    for (const [path, contents] of Object.entries(files)) {
        const absolutePath = join(root, path);
        await mkdir(dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, contents);
    }

    const first = await createBuildManifest(root);
    const second = await createBuildManifest(root);
    expect(second).toEqual(first);
    expect(first.files.map((entry) => entry.path)).toEqual(Object.keys(files).sort());

    await writeFile(join(root, "packages/features/example/dist/index.js"), "export const value = 2;\n");
    const changed = await createBuildManifest(root);
    expect(changed.files[0]!.sha256).not.toBe(first.files[0]!.sha256);
});
