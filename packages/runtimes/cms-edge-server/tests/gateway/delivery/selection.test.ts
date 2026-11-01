import { expect, test } from "bun:test";
import type { GatewayInvocation } from "@bernouy/cms-gateway";
import { createPublicResourceHandler } from "../../../src/runtime/resources/publicResource";
import { publicDeliveryInvocation } from "../../../src/runtime/resources/publicDeliveryInvocation";
import type { AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import { ResponseCache } from "../../../src/runtime/resources/cache/ResponseCache";

test("Edge chooses the admitted replacement independently of SemVer and sends headers only through context", async () => {
    for (const version of ["1.2.0", "2.0.0"]) {
        const calls: GatewayInvocation[] = [];
        let resolutions = 0;
        const handler = createPublicResourceHandler({
            resolveContract: async () => {
                resolutions++;
                return { release: { version, capabilities: [{ id: "delivery.resolve-resource" }] } } as never;
            },
            invoke: async (invocation) => {
                calls.push(invocation);
                return {
                    kind: "binary",
                    requestId: crypto.randomUUID(),
                    contentType: "application/octet-stream",
                    stream: new Response("page").body!,
                    resource: { status: 200, headers: { "content-type": "text/html" } },
                };
            },
        });
        const request = new Request("https://site.test/page?a=1&a=2", {
            headers: {
                "accept-language": "fr",
                "if-none-match": 'W/"v1"',
                range: "bytes=0-1,4-5",
                cookie: "private",
                authorization: "Bearer private",
            },
        });
        const response = await handler(request, { kind: "anonymous" });
        expect(await response.text()).toBe("page");
        expect(calls).toHaveLength(1);
        expect(resolutions).toBe(1);
        expect(calls[0]?.capabilityId).toBe("delivery.resolve-resource");
        expect(calls[0]?.input).toEqual({
            path: "/page",
            method: "GET",
            query: [
                { name: "a", value: "1" },
                { name: "a", value: "2" },
            ],
        });
        expect(calls[0]?.requestContext?.headers).toEqual({
            "accept-language": "fr",
            "if-none-match": 'W/"v1"',
            range: "bytes=0-1,4-5",
        });
        expect(calls[0]?.requestContext?.resource).toEqual({ url: request.url, method: "GET" });
    }
});
test("legacy selection preserves its schema, metadata opt-in and validator bytes", () => {
    const legacy = {
        release: {
            version: "1.1.0",
            capabilities: [
                {
                    id: "delivery.resolve-path",
                    input: { properties: { resourceMetadata: { type: "string", enum: ["cache-v1"] } } },
                },
            ],
        },
    } as unknown as AdmittedContractRelease;
    const result = publicDeliveryInvocation(
        new Request("https://site.test/", { headers: { "if-none-match": 'W/"v1"', range: "bytes=-12" } }),
        legacy,
        true,
    );
    expect(result.capabilityId).toBe("delivery.resolve-path");
    expect(result.input).toMatchObject({ ifNoneMatch: 'W/"v1"', range: { end: 12 }, resourceMetadata: "cache-v1" });
});

test("a shared resource cache hit performs no contract resolution or provider invocation", async () => {
    let resolutions = 0;
    let invocations = 0;
    const handler = createPublicResourceHandler(
        {
            resolveContract: async () => {
                resolutions++;
                return { release: { capabilities: [{ id: "delivery.resolve-resource" }] } } as never;
            },
            invoke: async () => {
                invocations++;
                return {
                    kind: "binary",
                    requestId: crypto.randomUUID(),
                    contentType: "application/octet-stream",
                    stream: new Response("page").body!,
                    resource: {
                        status: 200,
                        headers: { "content-type": "text/html", "cache-control": "public, max-age=60" },
                    },
                };
            },
        },
        {},
        new ResponseCache(),
    );
    for (let index = 0; index < 2; index++) {
        const response = await handler(new Request("https://site.test/page"), { kind: "anonymous" });
        expect(await response.text()).toBe("page");
        expect(response.headers.get("x-cache")).toBe(index === 0 ? "MISS" : "HIT");
    }
    expect(resolutions).toBe(1);
    expect(invocations).toBe(1);
});

test("invalid browser metadata is refused before Delivery resolution or invocation", async () => {
    let calls = 0;
    const fail = async (): Promise<never> => {
        calls++;
        throw new Error("Unexpected Provider access");
    };
    const handler = createPublicResourceHandler({ resolveContract: fail, invoke: fail });
    const response = await handler(
        new Request("https://site.test/page", { headers: { "accept-language": "a".repeat(5000) } }),
        { kind: "anonymous" },
    );
    expect(response.status).toBe(400);
    expect(calls).toBe(0);
});
