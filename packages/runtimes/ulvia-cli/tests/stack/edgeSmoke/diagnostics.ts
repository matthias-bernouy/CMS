import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { Browser } from "playwright";

export function assertPortAvailable(port: number, label: string): void {
    try {
        const probe = Bun.serve({ hostname: "127.0.0.1", port, fetch: () => new Response(null, { status: 204 }) });
        probe.stop(true);
    } catch (cause) {
        if (cause && typeof cause === "object" && "code" in cause && cause.code === "EADDRINUSE") {
            throw new Error(`Edge smoke ${label} port ${port} is occupied; inspect its owner before retrying.`);
        }
        throw cause;
    }
}
export async function writeFailureArtifacts(output: string, browser: Browser | undefined) {
    const directory = resolve(process.env.ULVIA_SMOKE_ARTIFACTS_DIR ?? "artifacts/edge-smoke");
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "runtime.log"), output, "utf8");
    const page = browser
        ?.contexts()
        .flatMap((context) => context.pages())
        .find((page) => !page.isClosed());
    if (page) {
        await Promise.all([
            page
                .screenshot({ path: join(directory, "failure.png"), fullPage: true, timeout: 5000 })
                .catch(() => undefined),
            Promise.race([
                page
                    .content()
                    .then((html) => writeFile(join(directory, "failure.html"), html, "utf8"))
                    .catch(() => undefined),
                Bun.sleep(5000),
            ]),
        ]);
    }
}
