import { expect, test } from "bun:test";
import { createPublicResourceHandler } from "../../src/runtime/resources/publicResource";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
test("public resolution forwards selected bounded fields and trusted actor only", async () => {
    const calls: GatewayInvocation[] = [];
    const handler = createPublicResourceHandler({
        invoke: async (value) => {
            calls.push(value);
            return {
                kind: "binary",
                requestId: crypto.randomUUID(),
                contentType: "application/octet-stream",
                stream: new Response("ok").body!,
                resource: { status: 200, headers: { "content-type": "text/plain" } },
            };
        },
    });
    const actor = { kind: "user", subjectId: "cms-subject" } as const;
    const response = await handler(
        new Request("https://site.test/foo?a=1&a=2", {
            headers: {
                cookie: "secret",
                authorization: "Bearer private",
                "x-fake": "ignore",
                range: "bytes=1-2",
                "if-range": '"v1"',
            },
        }),
        actor,
    );
    expect(await response.text()).toBe("ok");
    expect(calls[0]).toMatchObject({
        actor,
        input: {
            path: "/foo",
            method: "GET",
            query: [
                { name: "a", value: "1" },
                { name: "a", value: "2" },
            ],
            range: { start: 1, end: 2 },
            ifRange: '"v1"',
        },
    });
    expect(JSON.stringify(calls[0]?.input)).not.toContain("secret");
    expect(JSON.stringify(calls[0]?.input)).not.toContain("cms-subject");
    const invalid = await handler(new Request("https://site.test/", { headers: { range: "bytes=1-2,4-5" } }), actor);
    expect(invalid.status).toBe(400);
    expect(calls).toHaveLength(1);
});

test("versioned public Content assets omit user authority while Pages, Files and ambiguous URLs remain private", async () => {
    const calls: GatewayInvocation[] = [];
    const handler = createPublicResourceHandler({
        invoke: async (value) => {
            calls.push(value);
            return {
                kind: "binary",
                requestId: crypto.randomUUID(),
                stream: new Response("bytes").body!,
                contentType: "text/css",
                resource: {
                    status: 200,
                    headers: { "content-type": "text/css", "cache-control": "public, max-age=31536000, immutable" },
                },
            };
        },
    });
    const actor = { kind: "administrator", subjectId: "private" } as const;
    const version = "v=0123456789&r=sha256:" + "a".repeat(64);
    for (const path of [
        "/_content/style?" + version,
        "/_content/blocset?tags=cms-nav&" + version,
        "/_content/blocstyles?collection=theme&tags=cms-nav&" + version,
        "/_content/assets/bloc-runtime.js?v=0123456789",
    ]) {
        const response = await handler(
            new Request("https://site.test" + path, { headers: { cookie: "private" } }),
            actor,
        );
        expect(calls.at(-1)?.actor).toEqual({ kind: "anonymous" });
        expect(response.headers.get("cache-control")).toContain("immutable");
        await response.body?.cancel();
    }
    for (const path of [
        "/admin/pages",
        "/_content/style",
        "/_content/style?" + version + "&v=0123456789",
        "/_content/style?" + version + "&preview=1",
        "/.cms/call/files/private?v=0123456789",
    ]) {
        const response = await handler(new Request("https://site.test" + path), actor);
        expect(calls.at(-1)?.actor).toEqual(actor);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        await response.body?.cancel();
    }
});

test("the public helper disables caching unless the host injects its invalidated cache; bypasses skip negotiation", async () => {
    let calls = 0;
    let negotiation = 0;
    const gateway = {
        resolveContract: async () => {
            negotiation++;
            throw new Error("No metadata needed for a bypass");
        },
        invoke: async () => {
            calls++;
            return {
                kind: "binary" as const,
                requestId: crypto.randomUUID(),
                contentType: "text/plain",
                stream: new Response("public").body!,
                resource: {
                    status: 200,
                    headers: { "content-type": "text/plain", "cache-control": "public, max-age=60" },
                },
            };
        },
    };
    const handler = createPublicResourceHandler(gateway);
    for (let index = 0; index < 2; index++) {
        const response = await handler(new Request("https://site.test/page"), { kind: "anonymous" });
        expect(response.headers.get("x-cache")).toBe("BYPASS");
        expect(response.headers.get("vary")).toContain("Accept-Language");
        await response.text();
    }
    expect(calls).toBe(2);
    expect(negotiation).toBe(0);
});
