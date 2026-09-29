import { expect, test } from "bun:test";
import { handleGatewayImageGet } from "@bernouy/cms-gateway/media/handlers";
import type { GatewayInvocation } from "@bernouy/cms-gateway";

test("image route uses trusted actor, rejects invalid widths and returns private WebP", async () => {
    const calls: Array<{ invocation: GatewayInvocation; width: number }> = [];
    const options = {
        siteId: "site-a",
        origin: "delivery" as const,
        actor: { kind: "user" as const, subjectId: "user-1" },
        prefix: "/.cms/image",
        images: {
            get: async (invocation: GatewayInvocation, width: number) => {
                calls.push({ invocation, width });
                return { bytes: new Uint8Array([1, 2]), etag: '"sha256:bytes"', width, height: 100 };
            },
        },
    };
    const response = await handleGatewayImageGet(
        new Request("https://site.example/.cms/image/files/file.read/photo-1/256.webp"),
        options,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.arrayBuffer()).toEqual(new Uint8Array([1, 2]).buffer);
    expect(calls).toEqual([
        {
            invocation: {
                siteId: "site-a",
                contractId: "files",
                capabilityId: "file.read",
                input: { fileId: "photo-1" },
                origin: "delivery",
                actor: options.actor,
            },
            width: 256,
        },
    ]);
    expect(
        (
            await handleGatewayImageGet(
                new Request("https://site.example/.cms/image/files/file.read/photo-1/no.webp"),
                options,
            )
        ).status,
    ).toBe(404);
    expect(calls).toHaveLength(1);
});

test("image route preserves declared provider error retry metadata", async () => {
    const response = await handleGatewayImageGet(
        new Request("https://site.example/.cms/image/files/file.read/photo-1/256.webp"),
        {
            siteId: "site-a",
            origin: "delivery",
            actor: { kind: "anonymous" },
            prefix: "/.cms/image",
            images: {
                get: async () => ({
                    status: 429,
                    requestId: "request-1",
                    responseHeaders: { "retry-after": "30" },
                }),
            },
        },
    );
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("30");
    expect(response.headers.get("x-ulvia-request-id")).toBe("request-1");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
});
