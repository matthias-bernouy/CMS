import { createRequire } from "node:module";
import { expect, test } from "bun:test";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { writeExampleSource } from "./fixture";

test.skipIf(process.env.ULVIA_RUN_EXAMPLE_BROWSER !== "1")(
    "bundled CLI previews ship their own worker without accessing workspace source files",
    async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia bundled capture "));
        try {
            const source = await writeExampleSource(root);
            const runtimeRoot = resolve("packages/features/content/dist/runtime-assets");
            const bundle = await Bun.build({
                entrypoints: [resolve(import.meta.dir, "../../src/index.ts")],
                target: "bun",
                packages: "bundle",
                external: ["css-tree", "playwright"],
                outdir: join(root, "dist"),
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
                outdir: join(root, "dist/capture-worker"),
                naming: "worker.js",
            });
            expect(worker.success).toBeTrue();
            await symlink(resolve("node_modules"), join(root, "node_modules"));
            const child = Bun.spawn(
                [process.execPath, join(root, "dist/index.js"), "preview", source, "--output", join(root, "output")],
                {
                    env: {
                        ...process.env,
                        ULVIA_DATA_DIR: join(root, "data"),
                        NODE_PATH: dirname(
                            dirname(
                                createRequire(resolve("packages/features/repository/package.json")).resolve(
                                    "css-tree/package.json",
                                ),
                            ),
                        ),
                    },
                    stdout: "pipe",
                    stderr: "pipe",
                },
            );
            const [code, stderr] = await Promise.all([
                child.exited,
                new Response(child.stderr).text(),
                new Response(child.stdout).text(),
            ]);
            expect(stderr).toBe("");
            expect(code).toBe(0);
            const manifest = await Bun.file(join(root, "output/manifest.json")).json();
            expect(manifest.captures).toHaveLength(2);
            expect(
                (await Bun.file(join(root, "output/contact--desktop.png")).arrayBuffer()).byteLength,
            ).toBeGreaterThan(0);
        } finally {
            await rm(root, { recursive: true, force: true });
        }
    },
    30_000,
);
