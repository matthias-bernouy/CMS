import { fakeDockerFixturePath } from "./docker";
import { chmod, cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

/** Real CLI subprocesses with process/HTTP peers; this is not a container acceptance fixture. */
export async function profileCliFixture() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-profile-cli-"));
    const bin = join(root, "bin");
    await mkdir(bin);
    await cp(fakeDockerFixturePath, join(bin, "docker"));
    await chmod(join(bin, "docker"), 0o755);
    const official = { id: "ulvia.official", version: "1.3.0" };
    const registry = { id: "ulvia.repository", version: "1.0.0" };
    const state = { rejectUpgrade: false, unauthorized: 0, creates: [] as unknown[], upgrades: [] as unknown[] };
    const provider = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            const expected = await readFile(join(root, "data/services/provider-operator-token"), "utf8");
            if (request.headers.get("authorization") !== `Bearer ${expected}`) {
                state.unauthorized++;
                return new Response(null, { status: 401 });
            }
            const path = new URL(request.url).pathname;
            if (request.method === "GET" && path === "/ulvia/operator/profiles") {
                return Response.json({
                    defaultProfile: official,
                    profiles: [official, registry, { ...registry, version: "1.1.0" }],
                });
            }
            if (request.method === "POST" && path === "/ulvia/operator/instances") {
                const input = await request.json();
                state.creates.push(input);
                return Response.json({
                    instance: {
                        id: "instance:00000000-0000-4000-8000-000000000001",
                        status: "ready",
                        profile: input.profile,
                    },
                    credentials: { instanceAccessToken: "a".repeat(43) },
                });
            }
            if (request.method === "POST" && path.endsWith("/profile")) {
                const profile = await request.json();
                state.upgrades.push(profile);
                return state.rejectUpgrade
                    ? new Response(null, { status: 503 })
                    : Response.json({ status: "ready", profile });
            }
            return new Response(null, { status: 404 });
        },
    });
    const proxy = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("ready") });
    return {
        root,
        state,
        async run(args: string[], extra: Record<string, string> = {}) {
            const child = Bun.spawn([process.execPath, resolve(import.meta.dir, "../../../src/index.ts"), ...args], {
                env: {
                    ...process.env,
                    PATH: `${bin}:${process.env.PATH}`,
                    ULVIA_DATA_DIR: join(root, "data"),
                    ULVIA_TEST_DOCKER_ROOT: root,
                    ULVIA_HTTP_PORT: String(proxy.port),
                    ULVIA_PROVIDER_PORT: String(provider.port),
                    CMS_REPOSITORY_URL: "http://127.0.0.1:1",
                    CMS_REPOSITORY_ALLOW_INSECURE_HTTP: "true",
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
        },
        async close() {
            provider.stop(true);
            proxy.stop(true);
            await rm(root, { recursive: true, force: true });
        },
    };
}
