import { expect, test } from "bun:test";
import { handleGatewayHttpCall } from "@bernouy/cms-gateway/http/handlers";
import { fixture } from "./fixture";

test("JSON revalidation preserves 304 and long safe headers through SDK, Gateway and browser", async () => {
    const f = await fixture(false);
    const link = "<https://site.test/" + "a".repeat(1400) + '>; rel="next"';
    let invocations = 0;
    f.dispatcher.register("ulvia/catalog", "item.list", async (_input, context) => {
        invocations++;
        const headers = { etag: '"v1"', link, "cache-control": "public, max-age=60" };
        return context.http.headers.get("if-none-match") === '"v1"'
            ? new Response(null, { status: 304, headers })
            : Response.json({ items: ["one"] }, { headers });
    });
    f.mount();
    for (const conditional of [false, true]) {
        const response = await handleGatewayHttpCall(
            new Request("https://site.test/.cms/call/ulvia/catalog/v1/items", {
                headers: conditional ? { "if-none-match": '"v1"' } : {},
            }),
            { siteId: "site-a", actor: { kind: "anonymous" }, prefix: "/.cms/call", invoker: f.gateway },
        );
        expect(response.status).toBe(conditional ? 304 : 200);
        expect(response.headers.get("etag")).toBe('"v1"');
        expect(response.headers.get("link")).toBe(link);
        expect(await response.text()).toBe(conditional ? "" : '{"items":["one"]}');
    }
    expect(invocations).toBe(2);
});

test("unsolicited 304 outcomes are refused instead of bypassing the selected output schema", async () => {
    const f = await fixture(false);
    f.dispatcher.register("ulvia/catalog", "item.list", async () => new Response(null, { status: 304 }));
    f.mount();
    await expect(
        f.gateway.invoke({
            siteId: "site-a",
            contractId: "ulvia/catalog",
            capabilityId: "item.list",
            input: {},
            actor: { kind: "anonymous" },
        }),
    ).rejects.toMatchObject({ code: "invalid_provider_response" });
});

test("native resource revalidation accepts a Fetch 304 without representation metadata", async () => {
    const f = await fixture(true);
    f.dispatcher.register(
        "ulvia/catalog",
        "item.list",
        async () => new Response(null, { status: 304, headers: { etag: '"v1"' } }),
    );
    f.mount();
    const result = await f.gateway.invoke({
        siteId: "site-a",
        contractId: "ulvia/catalog",
        capabilityId: "item.list",
        input: { fileId: "one" },
        actor: { kind: "anonymous" },
        requestContext: {
            headers: { "if-none-match": '"v1"' },
            resource: { method: "GET", url: "https://site.test/one" },
        },
    });
    expect(result.kind).toBe("binary");
    if (result.kind !== "binary") {
        throw new Error("Expected a native resource");
    }
    expect(result.resource).toMatchObject({ status: 304, headers: { etag: '"v1"' } });
    expect(result.resource?.headers["content-type"]).toBeUndefined();
    expect(await new Response(result.stream).text()).toBe("");
});
