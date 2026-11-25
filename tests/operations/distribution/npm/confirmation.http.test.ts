import { expect, test } from "bun:test";
import { prepareNpmPublication } from "../../../../infra/distribution/npm";
import { npmFixture } from "./fixture";

test("real HTTP missing/stale responses reconcile publication and channel promotion without repeated writes", async () => {
    const f = await npmFixture();
    let missing = 3;
    let stale = 3;
    let missingTags = 1;
    let cancelled = false;
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (request) => {
            expect(request.headers.get("cache-control")).toBe("no-cache");
            const path = new URL(request.url).pathname;
            if (f.stored() && path.endsWith("/dist-tags") && f.calls.length > 1) {
                if (missingTags-- > 0) {
                    return new Response("tags not yet visible", { status: 404 });
                }
                if (stale-- > 0) {
                    return Response.json({ latest: "1.0.0" });
                }
            }
            if (f.stored() && !path.endsWith("/dist-tags") && missing-- > 0) {
                return new Response("not yet available", { status: 404 });
            }
            return f.transport.fetch(`https://registry.npmjs.org${path}`, { redirect: "error" });
        },
    });
    try {
        const publication = await prepareNpmPublication(f.archive, f.version, {
            ...f.transport,
            fetch: (url, options) => fetch(new URL(new URL(url).pathname, server.url), options),
        });
        await publication.publish();
        expect(f.calls.filter((args) => args[0] === "bun")).toHaveLength(1);
        expect(f.waits).toEqual([1000, 2000, 4000]);
        expect(f.tags.latest).toBe("1.0.0");
        await publication.promote();
        expect(f.waits).toEqual([1000, 2000, 4000, 1000, 2000, 4000, 8000]);
        expect(f.calls.filter((args) => args[0] === "npm")).toHaveLength(1);
        expect(f.tags.latest).toBe(f.version);
        await publication.promote();
        expect(f.calls).toHaveLength(2);
        const readSignals: AbortSignal[] = [];
        const retry = await prepareNpmPublication(f.archive, f.version, {
            ...f.transport,
            fetch: async (url, options) => {
                if (options.signal) {
                    readSignals.push(options.signal);
                }
                return f.transport.fetch(url, options);
            },
        });
        await retry.verify();
        cancelled = readSignals.some((signal) => signal.aborted);
        expect(cancelled).toBe(true);
    } finally {
        server.stop(true);
        await f.close();
    }
});
