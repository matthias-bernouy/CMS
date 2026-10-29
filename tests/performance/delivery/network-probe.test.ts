import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { networkPreloadSource } from "../../integration/instance/performance/network-preload";

test("the delivery probe counts fetch and the real pinned HTTP transport without sensitive data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "ulvia-network-probe-"));
    const preload = join(directory, "probe.ts");
    const log = join(directory, "requests.ndjson");
    const program = join(directory, "request.ts");
    const transport = resolve("packages/features/cms-gateway/src/invocation/node-http/nodeHttpRequest.ts");
    try {
        await writeFile(preload, networkPreloadSource(log));
        await writeFile(
            program,
            `
import { sendPinnedHttpRequest } from ${JSON.stringify(transport)};
const server = Bun.serve({ port: 0, fetch: () => new Response("ok") });
try {
    const control = await fetch(new URL("/control?token=secret", server.url), {
        headers: { authorization: "Bearer secret" },
    });
    await control.text();
    for (const stream of [false, true]) {
        const response = await sendPinnedHttpRequest({
            url: new URL(stream ? "/stream?key=secret" : "/business?key=secret", server.url),
            address: { address: "127.0.0.1", family: 4 },
            method: "POST",
            headers: { host: server.url.host, authorization: "Bearer secret" },
            signal: AbortSignal.timeout(2000),
            body: stream ? new ReadableStream({
                start(controller) {
                    controller.enqueue(new TextEncoder().encode("secret-body"));
                    controller.close();
                },
            }) : "secret-body",
        });
        await response.text();
    }
} finally {
    server.stop(true);
}
`,
        );
        const child = Bun.spawn([process.execPath, "--preload", preload, program], {
            stdout: "pipe",
            stderr: "pipe",
        });
        const error = await new Response(child.stderr).text();
        expect(await child.exited, error).toBe(0);
        expect((await readFile(log, "utf8")).trim().split("\n")).toEqual(["/control", "/business", "/stream"]);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
