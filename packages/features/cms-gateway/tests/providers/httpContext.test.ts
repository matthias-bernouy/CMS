import { expect, test } from "bun:test";
import { requestContext } from "@bernouy/cms-gateway/protocol";
import { fixture } from "./context/fixture";

test("an independent provider receives normal headers and returns validated JSON response headers", async () => {
    const f = await fixture(false);
    f.dispatcher.register("ulvia/catalog", "item.list", async (_input, context) =>
        Response.json(
            { items: [context.http.headers.get("accept-language")] },
            { headers: { etag: '"v1"', link: '</next>; rel="next"', "content-language": "fr" } },
        ),
    );
    f.mount();
    const result = await f.gateway.invoke({
        siteId: "site-a",
        contractId: "ulvia/catalog",
        capabilityId: "item.list",
        input: {},
        actor: { kind: "anonymous" },
        requestContext: requestContext(new Request("https://site.test/", { headers: { "accept-language": "fr" } })),
    });
    expect(result).toMatchObject({
        kind: "success",
        output: { items: ["fr"] },
        responseHeaders: { etag: '"v1"', "content-language": "fr", link: '</next>; rel="next"' },
    });
});
test("native Response streams arrive before production completes and cancellation reaches the provider", async () => {
    const f = await fixture(true);
    let cancelled = false;
    f.dispatcher.register("ulvia/catalog", "item.list", async (_input, context) => {
        expect(context.http.headers.get("range")).toBe("bytes=0-1");
        expect(context.http.transportRequest?.headers.get("range")).toBeNull();
        return new Response(
            new ReadableStream({
                start: (controller) => controller.enqueue(new TextEncoder().encode("hi")),
                cancel() {
                    cancelled = true;
                },
            }),
            {
                headers: {
                    "content-type": "text/html; charset=utf-8",
                    "cache-control": "no-store, no-transform",
                    etag: '"v1"',
                },
            },
        );
    });
    f.mount();
    const result = await f.gateway.invoke({
        siteId: "site-a",
        contractId: "ulvia/catalog",
        capabilityId: "item.list",
        input: { fileId: "one" },
        actor: { kind: "anonymous" },
        requestContext: requestContext(
            new Request("https://site.test/page", { headers: { range: "bytes=0-1" } }),
            true,
        ),
    });
    expect(result.kind).toBe("binary");
    if (result.kind !== "binary") {
        throw new Error("Expected stream");
    }
    expect(result.resource?.headers["content-type"]).toBe("text/html; charset=utf-8");
    const reader = result.stream.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("hi");
    await reader.cancel("browser left");
    expect(cancelled).toBe(true);
});

test("a public HEAD strips a native Response body even when its technical binding uses GET", async () => {
    const f = await fixture(true);
    let cancelled = false;
    f.dispatcher.register("ulvia/catalog", "item.list", async (_input, context) => {
        expect(context.http.transportRequest?.method).toBe("GET");
        expect(context.http.resource?.method).toBe("HEAD");
        return new Response(
            new ReadableStream({
                cancel() {
                    cancelled = true;
                },
            }),
            { headers: { "content-type": "text/plain", "content-length": "42", etag: '"v1"' } },
        );
    });
    f.mount();
    const result = await f.gateway.invoke({
        siteId: "site-a",
        contractId: "ulvia/catalog",
        capabilityId: "item.list",
        input: { fileId: "one" },
        actor: { kind: "anonymous" },
        requestContext: requestContext(new Request("https://site.test/page", { method: "HEAD" }), true),
    });
    expect(result.kind).toBe("binary");
    if (result.kind !== "binary") {
        throw new Error("Expected stream");
    }
    expect(result.resource?.headers["content-length"]).toBe("42");
    expect(await new Response(result.stream).text()).toBe("");
    expect(cancelled).toBe(true);
});
