import { expect, test } from "bun:test";
import { createCapabilityQueryHandler } from "@bernouy/cms-gateway/http/handlers";
import { preparedFixture } from "./fixture";

// Scope reuse covers initial access/binding metadata, never the final dispatch authority.
test("one logical request reads one initial route; another request and a revoked grant remain fresh", async () => {
    const f = await preparedFixture();
    const handler = createCapabilityQueryHandler({
        ...f.gateway,
        siteId: "default",
        basePath: "/",
        resolveActor: async () => ({ kind: "administrator", subjectId: "cms-user", authorizationRevision: 1 }),
    });
    const request = () => new Request("https://site.test/.cms/query/ulvia/catalog/item.list");
    try {
        expect(await (await handler(request())).json()).toEqual({ items: ["authorized"] });
        expect(f.requests.filter((path) => path === "/gateway/route-snapshot")).toHaveLength(1);
        expect(await (await handler(request())).json()).toEqual({ items: ["authorized"] });
        expect(f.requests.filter((path) => path === "/gateway/route-snapshot")).toHaveLength(2);
        f.deny();
        expect((await handler(request())).status).toBe(403);
        expect(f.events.filter((event) => event === "business")).toHaveLength(2);
        expect(f.requests.filter((path) => path === "/gateway/route-snapshot")).toHaveLength(3);
    } finally {
        f.close();
    }
});

test("a logical scope retains no rejected promise in a later request and refuses another metadata target", async () => {
    const f = await preparedFixture();
    try {
        const scope = f.gateway.createInvocationScope("ulvia/catalog");
        await expect(scope.resolveCapability("ulvia/another", "item.list")).rejects.toThrow("another contract");
        const next = f.gateway.createInvocationScope("ulvia/catalog");
        expect(await next.resolveCapability("ulvia/catalog", "item.list")).toMatchObject({ access: "admin" });
        expect(f.requests.filter((path) => path === "/gateway/route-snapshot")).toHaveLength(1);
    } finally {
        f.close();
    }
});
