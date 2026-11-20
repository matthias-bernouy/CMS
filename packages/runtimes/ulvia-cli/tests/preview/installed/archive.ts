import { expect } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { npmCommand } from "./registry";

export async function packedCli(root: string, dependencies: Record<string, string>): Promise<string> {
    const directory = join(root, "package");
    await mkdir(directory);
    const runtimeRoot = resolve("packages/features/content/dist/runtime-assets");
    const bundle = await Bun.build({
        entrypoints: [resolve("packages/runtimes/ulvia-cli/src/index.ts")],
        target: "bun",
        packages: "bundle",
        external: ["css-tree", "playwright"],
        outdir: join(directory, "dist"),
        naming: "index.js",
        define: {
            __ULVIA_CAPTURE_WORKER_BUNDLED__: "true",
            __ULVIA_PREVIEW_RUNTIMES__: JSON.stringify({
                blocRuntime: await Bun.file(join(runtimeRoot, "bloc-runtime.js")).text(),
                bindingCore: await Bun.file(join(runtimeRoot, "binding-core.js")).text(),
            }),
        },
    });
    expect(bundle.success).toBeTrue();
    const worker = await Bun.build({
        entrypoints: [resolve("packages/foundation/browser-capture/src/playwright/worker.ts")],
        target: "bun",
        outdir: join(directory, "dist/capture-worker"),
        naming: "worker.js",
    });
    expect(worker.success).toBeTrue();
    await Bun.write(
        join(directory, "package.json"),
        JSON.stringify({
            name: "@cyaxis/ulvia",
            version: "0.0.0-capture-test",
            type: "module",
            bin: { ulvia: "dist/index.js" },
            files: ["dist"],
            dependencies,
        }),
    );
    const packed = JSON.parse(await npmCommand(["pack", "--json"], directory, root));
    return join(directory, packed[0].filename);
}
