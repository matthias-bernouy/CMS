import { expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { profileCliFixture } from "./fixture";

test("CLI deploys Repository as a named CMS application and preserves data through restarts and updates", async () => {
    const fixture = await profileCliFixture();
    const { root, run, state } = fixture;
    const data = join(root, "data");
    const instancePath = join(data, "instances/registry");
    const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
    try {
        expect((await run(["services", "start", "--version", "0.1.0"])).exitCode).toBe(0);
        const servicesPath = join(data, "services/stack.json");
        const initialServices = await json(servicesPath);
        expect(Object.keys(initialServices.images)).toEqual(["provider"]);
        expect(Object.keys(initialServices.installation.ports).sort()).toEqual(["http", "provider"]);
        const missing = await run(["instance", "create", "missing", "--profile", "repository@9.0.0"]);
        expect(missing.stderr).toContain("unavailable");
        expect(state.creates).toHaveLength(0);
        expect(await Bun.file(join(data, "instances/missing/runtime.json")).exists()).toBe(false);
        const created = await run(["instance", "create", "registry", "--profile", "repository@1.0.0"]);
        expect(created.stderr).toBe("");
        expect(created.exitCode).toBe(0);
        const initial = await json(join(instancePath, "runtime.json"));
        const connection = await readFile(join(instancePath, "instance.json"), "utf8");
        expect(initial.profile).toEqual({ id: "repository", version: "1.0.0" });
        expect(state.creates).toHaveLength(1);
        const marker = join(data, "services/cms-files/edited-page.json");
        await writeFile(marker, '{"title":"Preserved page"}');
        expect((await run(["instance", "stop", "registry"])).exitCode).toBe(0);
        expect((await run(["instance", "start", "registry"])).exitCode).toBe(0);
        expect(await json(join(instancePath, "runtime.json"))).toEqual(initial);
        expect((await run(["instance", "status", "registry"])).stdout).toContain("repository@1.0.0");
        state.rejectUpgrade = true;
        expect((await run(["instance", "upgrade-profile", "registry", "repository@1.1.0"])).exitCode).not.toBe(0);
        expect(await json(join(instancePath, "runtime.json"))).toEqual(initial);
        state.rejectUpgrade = false;
        expect((await run(["instance", "upgrade-profile", "registry", "ulvia@1.0.0"])).stderr).toContain(
            "application identity",
        );
        expect(state.upgrades).toHaveLength(1);
        expect((await run(["instance", "upgrade-profile", "registry", "repository@1.1.0"])).exitCode).toBe(0);
        expect(await json(join(instancePath, "runtime.json"))).toEqual({
            ...initial,
            profile: { id: "repository", version: "1.1.0" },
        });
        expect(await readFile(join(instancePath, "instance.json"), "utf8")).toBe(connection);
        expect(
            (await run(["upgrade", "provider", "--version", "0.2.0"], { ULVIA_TEST_DOCKER_FAIL_VERSION: "0.2.0" }))
                .exitCode,
        ).not.toBe(0);
        expect(await json(servicesPath)).toEqual(initialServices);
        expect((await run(["upgrade", "provider", "--version", "0.2.0"])).exitCode).toBe(0);
        expect((await json(servicesPath)).images.provider.version).toBe("0.2.0");
        expect(await readFile(marker, "utf8")).toBe('{"title":"Preserved page"}');
        expect(state.unauthorized).toBe(0);
        const calls = (await readFile(join(root, "calls.ndjson"), "utf8"))
            .trim()
            .split("\n")
            .map((line) => JSON.parse(line));
        expect(
            calls.some(
                ({ args }) =>
                    args.includes("run") &&
                    args.includes("packages/runtimes/ulvia-provider-server/src/checkRetention.ts"),
            ),
        ).toBe(true);
        expect(
            calls
                .filter(({ args }) => args[0] === "pull")
                .every(({ args }) => /cyaxis\/ulvia-(provider|edge):/u.test(args[1])),
        ).toBe(true);
        expect(
            calls
                .filter(({ args }) => args[0] === "compose")
                .every(({ args }) => !args.some((arg: string) => /repository.*\.yml$/u.test(basename(arg)))),
        ).toBe(true);
        expect(calls.some(({ args }) => args.includes("build") || args.includes("push"))).toBe(false);
        expect(JSON.stringify(calls)).not.toContain(initial.adminPassword);
    } finally {
        await fixture.close();
    }
});
