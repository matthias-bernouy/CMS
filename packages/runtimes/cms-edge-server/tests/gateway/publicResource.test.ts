import { expect, test } from "bun:test";
import { createPublicResourceHandler } from "../../src/runtime/publicResource";
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
