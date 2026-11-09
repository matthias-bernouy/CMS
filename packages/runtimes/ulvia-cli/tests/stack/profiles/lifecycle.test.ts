import { expect, test } from "bun:test";
import { readFile, writeFile, stat, lstat, rm } from "node:fs/promises";
import { join } from "node:path";
import { profileCliFixture } from "./fixture";

test("CLI starts shared hosting, preserves credentials and data, scales Edges and rolls back failed updates", async () => {
    const fixture = await profileCliFixture();
    const { root, run, state } = fixture;
    const data = join(root, "data");
    const json = async (path: string) => JSON.parse(await readFile(path, "utf8"));
    try {
        const started = await run(["start", "--version", "0.1.0", "--domain", "control.localhost"]);
        expect(started.stderr).toBe("");
        expect(started.exitCode).toBe(0);
        expect(started.stdout).toContain("Control is accessible");
        const servicesPath = join(data, "services/stack.json");
        const initialServices = await json(servicesPath);
        expect(Object.keys(initialServices.images).sort()).toEqual(["edge", "provider"]);
        expect(initialServices.installation.hosting.edgeCount).toBe(1);
        const administratorPath = join(data, "services/credentials/control-administrator.json");
        const administrator = await json(administratorPath);
        const runtimePath = join(data, "services/runtime.json");
        const runtime = await json(runtimePath);
        const operatorPath = join(data, "services/provider-operator-token");
        const operator = await readFile(operatorPath, "utf8");
        expect((await stat(administratorPath)).mode & 0o777).toBe(0o600);
        expect(started.stdout).not.toContain(administrator.password);
        expect(started.stdout).not.toContain(runtime.edgeRoutingSecret);
        expect(started.stdout).not.toContain(operator);
        const marker = join(data, "services/cms-files/edited-page.json");
        await writeFile(marker, '{"title":"Preserved page"}');
        const removed = await run(["instance", "create", "registry"]);
        expect(removed.exitCode).not.toBe(0);
        expect(removed.stderr).toContain("Unknown command: instance");
        expect(state.creates).toHaveLength(0);
        const obsolete = await lstat(join(data, "instances")).catch((cause: NodeJS.ErrnoException) => {
            if (cause.code === "ENOENT") {
                return null;
            }
            throw cause;
        });
        expect(obsolete).toBeNull();
        expect((await run(["services", "stop"])).exitCode).toBe(0);
        expect((await run(["start"])).exitCode).toBe(0);
        expect(await json(servicesPath)).toEqual(initialServices);
        expect(await json(administratorPath)).toEqual(administrator);
        expect(await json(runtimePath)).toEqual(runtime);
        expect(await readFile(operatorPath, "utf8")).toBe(operator);
        const refusedDomain = await run(["configure", "hosting", "--domain", "other.localhost"]);
        expect(refusedDomain.stderr).toContain("Control origin cannot change");
        const refusedNetwork = await run(["configure", "network", "--http-port", "8080"]);
        expect(refusedNetwork.stderr).toContain("locked after the first infrastructure start");
        expect((await run(["configure", "hosting", "--edges", "2"])).exitCode).toBe(0);
        expect((await run(["start"])).exitCode).toBe(0);
        const scaled = await json(servicesPath);
        expect(scaled.installation.hosting.edgeCount).toBe(2);
        const compose = await json(join(data, "services/shared-edges.json"));
        expect(Object.keys(compose.services).sort()).toEqual(["edge-1", "edge-2", "proxy"]);
        const status = await run(["services", "status"]);
        expect(status.exitCode).toBe(0);
        expect(status.stdout).toContain("edge-2");
        for (const component of ["provider", "edge"]) {
            const failed = await run(["upgrade", component, "--version", "0.2.0"], {
                ULVIA_TEST_DOCKER_FAIL_VERSION: "0.2.0",
                ULVIA_TEST_DOCKER_FAIL_COMPONENT: component,
            });
            expect(failed.exitCode).not.toBe(0);
            expect(await json(servicesPath)).toEqual(scaled);
        }
        expect((await run(["upgrade", "provider", "--version", "0.2.0"])).exitCode).toBe(0);
        expect((await run(["upgrade", "edge", "--version", "0.2.0"])).exitCode).toBe(0);
        expect((await json(servicesPath)).images.provider.version).toBe("0.2.0");
        expect((await json(servicesPath)).images.edge.version).toBe("0.2.0");
        expect(await json(runtimePath)).toEqual(runtime);
        expect(await json(administratorPath)).toEqual(administrator);
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
                .every(
                    ({ args }) =>
                        args.includes("--project-name") &&
                        !args.some((arg: string) => /\/edge(?:-tls)?\.yml$/u.test(arg)),
                ),
        ).toBe(true);
        expect(calls.some(({ args }) => args.includes("build") || args.includes("push"))).toBe(false);
        expect(JSON.stringify(calls)).not.toContain(administrator.password);
        expect(JSON.stringify(calls)).not.toContain(operator);
        await rm(administratorPath);
        expect((await run(["services", "stop"])).exitCode).toBe(0);
        const reopened = await run(["start"]);
        expect(reopened.exitCode).toBe(0);
        expect(reopened.stdout).toContain("existing Control administrator");
        expect(reopened.stdout).not.toContain("Initial administrator credentials:");
        expect(await Bun.file(administratorPath).exists()).toBe(false);
        expect(await json(runtimePath)).toEqual(runtime);
    } finally {
        await fixture.close();
    }
}, 30_000);
