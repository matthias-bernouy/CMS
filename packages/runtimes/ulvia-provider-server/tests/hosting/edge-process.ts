import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export async function startTestEdge() {
    const root = await mkdtemp(join(tmpdir(), "ulvia-shared-edge-"));
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
    const port = reservation.port!;
    reservation.stop(true);
    const log = join(root, "edge.log");
    const process = Bun.spawn(
        [Bun.which("bun")!, "--no-macros", resolve(import.meta.dir, "../../../cms-edge-server/src/index.ts")],
        {
            env: {
                PATH: Bun.env.PATH,
                MODE: "PROD",
                CMS_HOST: "127.0.0.1",
                CMS_PORT: String(port),
                CMS_EDGE_RESPONSE_CACHE: "true",
                CMS_HOSTING_PROVIDER_URL: "http://127.0.0.1:5103",
                CMS_HOSTING_EDGE_SECRET: "edge-test-secret".repeat(3),
                BUN_RUNTIME_TRANSPILER_CACHE_PATH: join(root, "transpiler"),
            },
            stdout: Bun.file(log),
            stderr: Bun.file(log),
        },
    );
    const close = async (verify = true) => {
        process.kill("SIGTERM");
        const timeout = setTimeout(() => process.kill("SIGKILL"), 10_000);
        try {
            const code = await process.exited;
            if (verify && code !== 0) {
                throw new Error(
                    `Shared Edge did not shut down cleanly (${code}): ${(await Bun.file(log).text()).slice(-8000)}`,
                );
            }
        } finally {
            clearTimeout(timeout);
            await rm(root, { recursive: true, force: true });
        }
    };
    try {
        const deadline = Date.now() + 15_000;
        for (;;) {
            if (process.exitCode !== null) {
                throw new Error(`Shared Edge exited: ${(await Bun.file(log).text()).slice(-8000)}`);
            }
            try {
                if (
                    (await fetch(`http://127.0.0.1:${port}/readyz`, { signal: AbortSignal.timeout(500) })).status ===
                    204
                ) {
                    break;
                }
            } catch {}
            if (Date.now() >= deadline) {
                throw new Error(`Shared Edge readiness timed out: ${(await Bun.file(log).text()).slice(-8000)}`);
            }
            await Bun.sleep(50);
        }
    } catch (error) {
        await close(false);
        throw error;
    }
    return {
        close: () => close(),
        diagnostics: async () => (await Bun.file(log).text()).slice(-12_000),
        request: (hostname: string, path: string, init: RequestInit = {}) =>
            fetch(`http://127.0.0.1:${port}${path}`, {
                ...init,
                redirect: "manual",
                signal: AbortSignal.timeout(15_000),
                headers: { ...Object.fromEntries(new Headers(init.headers)), host: hostname },
            }),
    };
}
