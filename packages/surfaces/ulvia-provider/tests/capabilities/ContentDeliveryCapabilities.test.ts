import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher, type ProviderCapabilityInvocationContext } from "@bernouy/ulvia-provider";
import { registerContentCapabilities } from "@bernouy/ulvia-provider/capabilities";
const context: ProviderCapabilityInvocationContext = {
    requestId: crypto.randomUUID(),
    contractVersion: "1.0.0",
    siteId: "default",
    providerId: "ulvia.official",
    actorKind: "anonymous",
};
function fixture() {
    const calls: unknown[] = [];
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerContentCapabilities(dispatcher, {
        repo: {},
        collections: {},
        publicDelivery: () => ({
            resolvePath: async (...args: unknown[]) => {
                calls.push(args);
                return new Response("page", {
                    headers: {
                        "content-type": "text/html",
                        "set-cookie": "forbidden",
                        "content-security-policy": "unsafe",
                        etag: '"v1"',
                    },
                });
            },
        }),
    } as never);
    return { dispatcher, calls };
}
test("Content returns a native resource stream with cache metadata", async () => {
    const { dispatcher, calls } = fixture();
    const result = (await dispatcher.invoke(
        "ulvia.cms.content",
        "delivery.resolve-resource",
        { path: "/", method: "GET", query: [] },
        context,
    )) as ProviderResourceResponse;
    expect(await result.response.text()).toBe("page");
    expect(result.response.headers.get("content-type")).toBe("text/html");
    expect(result.metadata.cacheTags).toEqual(["content:pages"]);
    expect((calls[0] as unknown[]).slice(0, 2)).toEqual([
        { path: "/", method: "GET", query: [] },
        { kind: "anonymous" },
    ]);
});
test("missing signed actor context and authored actor injection fail before resolution", async () => {
    const { dispatcher, calls } = fixture();
    await expect(
        dispatcher.invoke(
            "ulvia.cms.content",
            "delivery.resolve-resource",
            { path: "/", method: "GET", query: [] },
            { ...context, actorKind: undefined },
        ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
        dispatcher.invoke(
            "ulvia.cms.content",
            "delivery.resolve-resource",
            { path: "/", method: "GET", query: [], actorKind: "administrator" },
            context,
        ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(calls).toHaveLength(0);
});

test("Delivery reads HTTP metadata outside input and rejects representation fields", async () => {
    const { dispatcher, calls } = fixture();
    const modern = {
        ...context,
        contractVersion: "1.0.0",
        http: { headers: new Headers({ "accept-language": "fr", "if-none-match": 'W/"v1"', range: "bytes=-12" }) },
    };
    const result = (await dispatcher.invoke(
        "ulvia.cms.content",
        "delivery.resolve-resource",
        { path: "/", method: "GET", query: [] },
        modern,
    )) as ProviderResourceResponse;
    expect(await result.response.text()).toBe("page");
    expect(result.metadata.cacheTags).toEqual(["content:pages"]);
    const request = (calls[0] as unknown[])[3] as { headers: Headers };
    expect(request.headers.get("accept-language")).toBe("fr");
    expect(request.headers.get("if-none-match")).toBe('W/"v1"');
    expect(request.headers.get("range")).toBe("bytes=-12");
    await expect(
        dispatcher.invoke(
            "ulvia.cms.content",
            "delivery.resolve-resource",
            { path: "/", method: "GET", query: [], acceptLanguage: "en" },
            modern,
        ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(calls).toHaveLength(1);
});
test("the removed delivery capability cannot be invoked", async () => {
    const { dispatcher, calls } = fixture();
    await expect(dispatcher.invoke("ulvia.cms.content", "delivery.resolve-path", {}, context)).rejects.toThrow();
    expect(calls).toHaveLength(0);
});
import type { ProviderResourceResponse } from "@bernouy/cms-gateway/provider/server";
