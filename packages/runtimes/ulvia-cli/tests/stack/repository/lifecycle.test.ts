import { expect, test } from "bun:test";
import { chmod, cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fakeDockerFixturePath } from "./fake-docker";

test("standalone Repository lifecycle pins images, isolates services, preserves data and rolls back a failed upgrade", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-repository-lifecycle-"));
    const cli = resolve(import.meta.dir, "../../../src/index.ts");
    try {
        const bin = join(root, "bin");
        await mkdir(bin);
        await cp(fakeDockerFixturePath, join(bin, "docker"));
        await chmod(join(bin, "docker"), 0o755);
        const run = async (args: string[], extra = {}) => {
            const child = Bun.spawn([process.execPath, cli, ...args], {
                env: {
                    ...process.env,
                    PATH: `${bin}:${process.env.PATH}`,
                    ULVIA_DATA_DIR: join(root, "data"),
                    ULVIA_TEST_DOCKER_ROOT: root,
                    ...extra,
                },
                stdout: "pipe",
                stderr: "pipe",
            });
            const [exitCode, stdout, stderr] = await Promise.all([
                child.exited,
                new Response(child.stdout).text(),
                new Response(child.stderr).text(),
            ]);
            return { exitCode, stdout, stderr };
        };
        expect(
            (await run(["repository", "start", "community", "--version", "0.1.0", "--port", "15010"])).exitCode,
        ).toBe(0);
        const path = join(root, "data/repositories/community/service.json");
        const initial = JSON.parse(await readFile(path, "utf8"));
        expect(initial.image.component).toBe("repository");
        expect(initial.port).toBe(15010);
        expect(initial.image.digest).toMatch(/^sha256:[0-9a-f]{64}$/u);
        const status = await run(["repository", "status", "community"]);
        expect(status.stdout).toContain("running / healthy");
        expect(status.stdout).not.toContain(
            await readFile(join(root, "data/repositories/community/repository-token"), "utf8"),
        );
        expect((await run(["repository", "stop", "community"])).exitCode).toBe(0);
        expect(JSON.parse(await readFile(path, "utf8"))).toEqual(initial);
        expect((await run(["repository", "start", "community", "--version", "0.2.0"])).exitCode).not.toBe(0);
        expect(
            (
                await run(["repository", "upgrade", "community", "--version", "0.2.0"], {
                    ULVIA_TEST_DOCKER_FAIL_VERSION: "0.2.0",
                })
            ).exitCode,
        ).not.toBe(0);
        expect(JSON.parse(await readFile(path, "utf8"))).toEqual(initial);
        expect((await run(["repository", "upgrade", "community", "--version", "0.2.0"])).exitCode).toBe(0);
        expect(JSON.parse(await readFile(path, "utf8")).image.version).toBe("0.2.0");
        const calls = (await readFile(join(root, "calls.ndjson"), "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line) as { args: string[]; image?: string });
        expect(
            calls
                .filter((call) => call.args[0] === "pull")
                .every((call) => call.args[1]?.includes("cyaxis/ulvia-official-repository")),
        ).toBe(true);
        expect(
            calls
                .filter((call) => call.args[0] === "compose")
                .every((call) => call.args.some((arg) => arg.endsWith("repository.yml"))),
        ).toBe(true);
        expect(calls.some((call) => call.args.includes("build") || call.args.includes("push"))).toBe(false);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
