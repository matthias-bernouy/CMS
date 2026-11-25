import { sourceStackRelease } from "@bernouy/ulvia-cli/stack-release-build";
import { registryFixturePath } from "./registry";
import { fakeDockerFixturePath } from "./docker";
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

/** Real CLI subprocesses with process/HTTP peers; this is not a container acceptance fixture. */
export async function profileCliFixture() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-profile-cli-"));
    const bin = join(root, "bin");
    await mkdir(bin);
    await mkdir(join(root, "registry"));
    for (const version of ["0.1.0", "0.2.0"]) {
        const directory = join(root, "registry", version);
        await mkdir(join(directory, "package/dist"), { recursive: true });
        await writeFile(
            join(directory, "package/dist/stack-release.json"),
            JSON.stringify(await sourceStackRelease(version)),
        );
        const packed = Bun.spawn(
            ["tar", "-czf", join(root, "registry", `${version}.tgz`), "-C", directory, "package"],
            { stdout: "ignore", stderr: "inherit" },
        );
        if ((await packed.exited) !== 0) {
            throw new Error("Could not prepare fixture release");
        }
    }
    await cp(fakeDockerFixturePath, join(bin, "docker"));
    await chmod(join(bin, "docker"), 0o755);
    const state = { rejectUpgrade: false, unauthorized: 0, creates: [] as unknown[], upgrades: [] as unknown[] };
    const provider = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            const path = new URL(request.url).pathname;
            if (path === "/readyz") {
                const paused = await Bun.file(join(root, "data/services/credentials/maintenance.json")).exists();
                return new Response(null, {
                    status: 204,
                    headers: { "ulvia-maintenance": paused ? "paused" : "active" },
                });
            }
            const expected = await readFile(join(root, "data/services/provider-operator-token"), "utf8");
            if (request.headers.get("authorization") !== `Bearer ${expected}`) {
                state.unauthorized++;
                return new Response(null, { status: 401 });
            }
            if (request.method === "POST" && path === "/ulvia/operator/instances") {
                const input = await request.json();
                state.creates.push(input);
                return Response.json({
                    instance: {
                        id: "instance:00000000-0000-4000-8000-000000000001",
                        status: "ready",
                    },
                    credentials: { instanceAccessToken: "a".repeat(43) },
                });
            }
            return new Response(null, { status: 404 });
        },
    });
    const proxy = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch() {
            const maintenance = await Bun.file(join(root, "frontend.json")).exists();
            return new Response("ready", {
                status: maintenance ? 503 : 200,
                headers: maintenance ? { "ulvia-maintenance": "upgrade" } : {},
            });
        },
    });
    return {
        root,
        state,
        async run(args: string[], extra: Record<string, string> = {}) {
            const child = Bun.spawn(
                [
                    process.execPath,
                    "--preload",
                    registryFixturePath,
                    resolve(import.meta.dir, "../../../src/index.ts"),
                    ...args,
                ],
                {
                    env: {
                        ...process.env,
                        PATH: `${bin}:${process.env.PATH}`,
                        ULVIA_DATA_DIR: join(root, "data"),
                        ULVIA_TEST_DOCKER_ROOT: root,
                        ULVIA_HTTP_PORT: String(proxy.port),
                        ULVIA_PROVIDER_PORT: String(provider.port),
                        ...extra,
                    },
                    stdout: "pipe",
                    stderr: "pipe",
                },
            );
            const [exitCode, stdout, stderr] = await Promise.all([
                child.exited,
                new Response(child.stdout).text(),
                new Response(child.stderr).text(),
            ]);
            return { exitCode, stdout, stderr };
        },
        async close() {
            provider.stop(true);
            proxy.stop(true);
            await rm(root, { recursive: true, force: true });
        },
    };
}
