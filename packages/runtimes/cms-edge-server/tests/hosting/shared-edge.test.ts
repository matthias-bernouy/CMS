import { expect, test } from "bun:test";
import { NOOP_LOGGER } from "@bernouy/logging";
import { SharedEdge } from "../../src/runtime/hosting/SharedEdge";
import type { EdgeRoute } from "@bernouy/hosting/routing";

function fixture() {
    const routes = new Map<string, EdgeRoute>();
    const closes: string[] = [];
    let creates = 0;
    let resolves = 0;
    for (const name of ["a", "b"]) {
        routes.set(`${name}.localhost`, {
            hostname: `${name}.localhost`,
            origin: `http://${name}.localhost`,
            canonicalOrigin: `http://${name}.localhost`,
            instanceId: `instance:${name}`,
            domainRevision: 1,
            instanceRevision: 1,
            resourceRevision: "11111111-1111-4111-8111-111111111111",
            controlLease: `${name}-opaque-routing-lease`,
            expiresAt: Date.now() + 60_000,
        });
    }
    const edge = new SharedEdge(
        {
            resolve: async (hostname) => {
                resolves++;
                return routes.get(hostname) ?? null;
            },
        },
        async (route) => {
            creates++;
            return {
                update() {},
                close: async () => {
                    closes.push(route.instanceId);
                },
                handle: async (request) =>
                    Response.json(
                        {
                            instance: route.instanceId,
                            origin: new URL(request.url).origin,
                            cookie: request.headers.get("cookie"),
                        },
                        { headers: { "set-cookie": `tenant=${route.instanceId}; HttpOnly; SameSite=Lax` } },
                    ),
            };
        },
        NOOP_LOGGER,
        { maxEntries: 2, maxPending: 2, maxWaiters: 8, idleMs: 60_000 },
    );
    return { edge, routes, closes, creates: () => creates, resolves: () => resolves };
}

test("one shared handler isolates same-path tenant contexts and refuses unknown or disabled warm routes", async () => {
    const f = fixture();
    try {
        const call = async (name: string, cookie = "") => {
            const response = await f.edge.handle(new Request(`http://${name}.localhost/same`, { headers: { cookie } }));
            return { response, value: response.status === 200 ? await response.json() : null };
        };
        const a = await call("a", "session=only-a");
        const b = await call("b", "session=only-b");
        expect(a.value).toEqual({ instance: "instance:a", origin: "http://a.localhost", cookie: "session=only-a" });
        expect(b.value).toEqual({ instance: "instance:b", origin: "http://b.localhost", cookie: "session=only-b" });
        expect(a.response.headers.get("set-cookie")).not.toContain("Domain=");
        expect(f.creates()).toBe(2);
        const before = f.resolves();
        await call("a");
        expect(f.resolves() - before).toBe(1);
        expect(f.creates()).toBe(2);
        f.routes.delete("a.localhost");
        expect((await call("a")).response.status).toBe(404);
        expect((await call("unknown")).response.status).toBe(404);
        expect((await call("b")).value.instance).toBe("instance:b");
    } finally {
        await f.edge.close();
    }
    expect(f.closes.sort()).toEqual(["instance:a", "instance:b"]);
});

test("domain revision changes replace warm contexts and aliases redirect to their canonical CMS origin", async () => {
    const f = fixture();
    try {
        await (await f.edge.handle(new Request("http://a.localhost/"))).text();
        f.routes.set("a.localhost", { ...f.routes.get("a.localhost")!, instanceRevision: 2 });
        await (await f.edge.handle(new Request("http://a.localhost/"))).text();
        expect(f.creates()).toBe(2);
        f.routes.set("alias.localhost", {
            ...f.routes.get("a.localhost")!,
            hostname: "alias.localhost",
            origin: "http://alias.localhost",
        });
        const response = await f.edge.handle(new Request("http://alias.localhost/path?value=1"));
        expect(response.status).toBe(308);
        expect(response.headers.get("location")).toBe("http://a.localhost/path?value=1");
        expect(f.creates()).toBe(2);
        expect(
            (await f.edge.handle(new Request("http://a.localhost/", { headers: { host: "b.localhost" } }))).status,
        ).toBe(400);
        const forwarded = await f.edge.handle(
            new Request("http://a.localhost/", { headers: { "x-forwarded-host": "b.localhost" } }),
        );
        expect((await forwarded.json()).instance).toBe("instance:a");
    } finally {
        await f.edge.close();
    }
});
