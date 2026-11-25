import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { profileCliFixture } from "../profiles/fixture";
import { sourceStackRelease } from "../../../src/runtime/stack/releases/local";
import { releaseDigest } from "../../../src/runtime/stack/releases/model";

test("a newer bundled CLI starts the old applied artifacts without changing images, secrets or configuration", async () => {
    const f = await profileCliFixture();
    try {
        expect((await f.run(["apply", "--version", "0.1.0"])).exitCode).toBe(0);
        expect((await f.run(["stop"])).exitCode).toBe(0);
        const stackPath = join(f.root, "data/services/stack.json");
        const state = await readFile(stackPath, "utf8");
        const applied = JSON.parse(state).applied;
        const source = await sourceStackRelease("0.2.0");
        const newer = {
            ...source,
            files: {
                ...source.files,
                "services.yml": source.files["services.yml"].replace("caddy:2.11.9", "caddy:9.0.0"),
            },
        };
        const directory = join(f.root, "new-cli");
        const result = await Bun.build({
            entrypoints: [resolve(import.meta.dir, "../../../src/index.ts")],
            outdir: directory,
            target: "bun",
            packages: "bundle",
            external: ["css-tree", "playwright"],
            define: {
                __ULVIA_CLI_VERSION__: JSON.stringify("0.2.0"),
                __ULVIA_DEFAULT_STACK_VERSION__: JSON.stringify("0.2.0"),
                __ULVIA_STACK_RELEASE__: JSON.stringify({ ...newer, digest: releaseDigest(newer) }),
            },
        });
        expect(result.success).toBe(true);
        const wrapper = join(f.root, "new-entry.ts");
        await writeFile(wrapper, `import ${JSON.stringify(join(directory, "index.js"))};`);
        const env = {
            ...process.env,
            PATH: `${join(f.root, "bin")}:${process.env.PATH}`,
            ULVIA_DATA_DIR: join(f.root, "data"),
            ULVIA_TEST_DOCKER_ROOT: f.root,
        };
        const callsBefore = (await readFile(join(f.root, "calls.ndjson"), "utf8")).trim().split("\n").length;
        const child = Bun.spawn([process.execPath, wrapper, "start"], { env, stdout: "pipe", stderr: "pipe" });
        const [code, stderr] = await Promise.all([
            child.exited,
            new Response(child.stderr).text(),
            new Response(child.stdout).text(),
        ]);
        expect(stderr).toBe("");
        expect(code).toBe(0);
        expect(await readFile(stackPath, "utf8")).toBe(state);
        const calls = (await readFile(join(f.root, "calls.ndjson"), "utf8"))
            .trim()
            .split("\n")
            .slice(callsBefore)
            .map((line) => JSON.parse(line));
        expect(calls.some(({ args }) => args.includes("pull") || args.includes("up"))).toBe(false);
        expect(
            calls
                .filter(({ args }) => args.includes("compose"))
                .every(({ args }) =>
                    args.some((arg: string) => arg.includes(`/deployments/${applied.id}/services.yml`)),
                ),
        ).toBe(true);
        expect(await readFile(join(f.root, "data/services/deployments", applied.id, "services.yml"), "utf8")).toContain(
            "caddy:2.11.9",
        );
        // Exercise the serialized copy worker after full CLI bundling, with the old frozen release.
        const checkpoint = join(f.root, "bundled-checkpoint");
        for (const action of ["create", "verify"]) {
            const backup = Bun.spawn([process.execPath, wrapper, "backup", action, checkpoint], {
                env,
                stdout: "pipe",
                stderr: "pipe",
            });
            const [code, stderr] = await Promise.all([
                backup.exited,
                new Response(backup.stderr).text(),
                new Response(backup.stdout).text(),
            ]);
            expect(code, stderr).toBe(0);
        }
        expect(await readFile(stackPath, "utf8")).toBe(state);
    } finally {
        await f.close();
    }
}, 15_000);
