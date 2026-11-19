import { expect, test } from "bun:test";
import { NOOP_LOGGER } from "@bernouy/logging";
import type { EdgeRoute } from "@bernouy/hosting/routing";
import { SharedEdge } from "../../src/runtime/hosting/SharedEdge";

function route(name: string): EdgeRoute {
    return {
        hostname: `${name}.localhost`,
        origin: `http://${name}.localhost`,
        canonicalOrigin: `http://${name}.localhost`,
        instanceId: `instance:${name}`,
        domainRevision: 1,
        instanceRevision: 1,
        resourceRevision: "11111111-1111-4111-8111-111111111111",
        controlLease: `${name}-private`,
        expiresAt: Date.now() + 60_000,
    };
}

test("waiting cold ingress rechecks domain authority and cannot fall back to another tenant", async () => {
    const gate = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const routes = new Map(["a", "b", "c"].map((name) => [`${name}.localhost`, route(name)]));
    const created: string[] = [];
    const edge = new SharedEdge(
        { resolve: async (host) => routes.get(host) ?? null },
        async (selected) => {
            created.push(selected.instanceId);
            if (selected.instanceId === "instance:a") {
                entered.resolve();
                await gate.promise;
            }
            return {
                update() {},
                close: async () => {},
                handle: async () => Response.json({ instance: selected.instanceId }),
            };
        },
        NOOP_LOGGER,
        {
            maxEntries: 4,
            maxPending: 1,
            maxWaiters: 2,
            idleMs: 60_000,
            admission: { maxQueued: 2, waitMs: 1000 },
        },
    );
    const first = edge.handle(new Request("http://a.localhost/"));
    await entered.promise;
    const changed = edge.handle(new Request("http://b.localhost/"));
    const healthy = edge.handle(new Request("http://c.localhost/"));
    try {
        await Bun.sleep(0);
        expect(edge.snapshot().queued).toBe(2);
        routes.delete("b.localhost");
        gate.resolve();
        expect((await changed).status).toBe(503);
        expect(await (await healthy).json()).toEqual({ instance: "instance:c" });
        expect(await (await first).json()).toEqual({ instance: "instance:a" });
        expect(created).toEqual(["instance:a", "instance:c"]);
        expect((await edge.handle(new Request("http://b.localhost/"))).status).toBe(404);
    } finally {
        gate.resolve();
        await Promise.all(
            [first, changed, healthy].map(async (job) => {
                const response = await job;
                if (!response.bodyUsed) {
                    await response.text();
                }
            }),
        );
        await edge.close();
    }
});
