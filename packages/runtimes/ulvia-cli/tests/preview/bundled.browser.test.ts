import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { imageSize } from "image-size";
import { writeExampleSource } from "./fixture";
import { packedCli } from "./installed/archive";
import { dependencyRegistry, npmCommand } from "./installed/registry";

test.skipIf(process.env.ULVIA_RUN_EXAMPLE_BROWSER !== "1")(
    "packed CLI previews capture identical frames after real npm hoisted and nested installations",
    async () => {
        const root = await mkdtemp(join(tmpdir(), "ulvia installed capture "));
        let registry;
        try {
            registry = await dependencyRegistry(root);
            const archive = await packedCli(root, registry.dependencies);
            const source = await writeExampleSource(root);
            let reference: string[] | undefined;
            for (const strategy of ["hoisted", "nested"]) {
                const installation = join(root, strategy);
                await mkdir(installation);
                await Bun.write(join(installation, "package.json"), JSON.stringify({ private: true }));
                await npmCommand(
                    [
                        "install",
                        archive,
                        "--omit=optional",
                        `--install-strategy=${strategy}`,
                        `--registry=${registry.url}`,
                    ],
                    installation,
                    root,
                );
                const packageRoot = join(installation, "node_modules/@cyaxis/ulvia");
                expect(await Bun.file(join(packageRoot, "node_modules/playwright/package.json")).exists()).toBe(
                    strategy === "nested",
                );
                expect(await Bun.file(join(installation, "node_modules/playwright/package.json")).exists()).toBe(
                    strategy === "hoisted",
                );
                const output = join(installation, "output");
                const child = Bun.spawn(
                    [process.execPath, join(packageRoot, "dist/index.js"), "preview", source, "--output", output],
                    {
                        cwd: installation,
                        env: {
                            PATH: process.env.PATH,
                            HOME: process.env.HOME,
                            ULVIA_DATA_DIR: join(installation, "data"),
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
                expect((await Bun.file(join(output, "manifest.json")).json()).captures).toHaveLength(2);
                const hashes = [];
                for (const [frame, width, height] of [
                    ["desktop", 640, 240],
                    ["mobile", 320, 160],
                ] as const) {
                    const bytes = new Uint8Array(await Bun.file(join(output, `contact--${frame}.png`)).arrayBuffer());
                    expect(imageSize(bytes)).toMatchObject({ width, height });
                    hashes.push(createHash("sha256").update(bytes).digest("hex"));
                }
                if (reference) {
                    expect(hashes).toEqual(reference);
                }
                reference = hashes;
            }
        } finally {
            registry?.stop();
            await rm(root, { recursive: true, force: true });
        }
    },
    120_000,
);
