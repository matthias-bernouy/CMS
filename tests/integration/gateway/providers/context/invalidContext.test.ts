import { expect, test } from "bun:test";
import {
    createCapabilityMutationHandler,
    createCapabilityQueryHandler,
    handleGatewayHttpCall,
} from "@bernouy/cms-gateway/http/handlers";
import { fixture } from "./fixture";

test("an oversized browser header is a 400 on bound and logical HTTP entrypoints", async () => {
    const f = await fixture(false);
    let calls = 0;
    f.dispatcher.register("ulvia/catalog", "item.list", async () => {
        calls++;
        return { items: [] };
    });
    f.mount();
    const config = {
        siteId: "site-a",
        basePath: "",
        invoker: f.gateway,
        resolveActor: async () => ({ kind: "anonymous" as const }),
        resolveCapability: async () => ({ access: "public" as const, effect: "query" as const, outputType: "object" }),
    };
    const bound = await handleGatewayHttpCall(
        new Request("https://site.test/.cms/call/ulvia/catalog/v1/items", {
            headers: { "accept-language": "a".repeat(5000) },
        }),
        { siteId: "site-a", actor: { kind: "anonymous" }, prefix: "/.cms/call", invoker: f.gateway },
    );
    expect(bound.status).toBe(400);
    const query = await createCapabilityQueryHandler(config)(
        new Request("https://site.test/.cms/query/ulvia/catalog/item.list", {
            headers: { "accept-language": "a".repeat(5000) },
        }),
    );
    expect(query.status).toBe(400);
    const mutation = await createCapabilityMutationHandler({
        ...config,
        resolveCapability: async () => ({ access: "public", effect: "command", outputType: "object" }),
    })(
        new Request("https://site.test/.cms/mutation/ulvia/catalog/item.list", {
            method: "POST",
            headers: { "content-type": "application/json", "accept-language": "a".repeat(5000) },
            body: "{}",
        }),
    );
    expect(mutation.status).toBe(400);
    expect(calls).toBe(0);
    expect(f.wireHeaders).toHaveLength(0);
});

test("malformed trusted metadata is a 400 and browser-supplied technical metadata is ignored", async () => {
    const f = await fixture(false);
    f.dispatcher.register("ulvia/catalog", "item.list", async () => ({ items: [] }));
    f.mount();
    for (const trusted of [true, false]) {
        const response = await handleGatewayHttpCall(
            new Request("https://site.test/.cms/call/ulvia/catalog/v1/items", {
                headers: { "x-ulvia-request-context": "%invalid" },
            }),
            {
                siteId: "site-a",
                actor: { kind: "anonymous" },
                prefix: "/.cms/call",
                invoker: f.gateway,
                trustedRequestContext: trusted,
            },
        );
        expect(response.status).toBe(trusted ? 400 : 200);
    }
    expect(f.wireHeaders).toHaveLength(1);
});
