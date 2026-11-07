import { expect, test } from "bun:test";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { RESOURCE_HEADER, encodeSessionEffect, SESSION_EFFECT_HEADER } from "@bernouy/cms-gateway/protocol";
import { toResponse } from "cms-gateway/invocation/node-http/nodeHttpRequest";

test("node response bridge pauses the source until the web body is consumed", async () => {
    const incoming = Readable.from(Array.from({ length: 32 }, () => Buffer.alloc(1024)));
    Object.assign(incoming, { statusCode: 200, headers: {} });
    let emitted = 0;
    const response = toResponse(incoming as IncomingMessage, "GET");
    incoming.on("data", () => {
        emitted += 1;
    });
    await Bun.sleep(10);
    expect(emitted).toBe(1);
    expect((await response.arrayBuffer()).byteLength).toBe(32 * 1024);
    expect(emitted).toBe(32);
});

test("node response bridge preserves only the trusted semantic session effect", async () => {
    const effect = encodeSessionEffect({
        type: "session",
        operation: "establish",
        token: "opaque-session-token",
        expiresAt: "2027-01-01T00:00:00.000Z",
    });
    const incoming = Readable.from([Buffer.from("{}")]);
    Object.assign(incoming, {
        statusCode: 200,
        headers: {
            [SESSION_EFFECT_HEADER]: effect,
            "set-cookie": "forged-provider-cookie=value",
            "x-untrusted-provider-header": "forged",
        },
    });

    const response = toResponse(incoming as IncomingMessage, "GET");

    expect(response.headers.get(SESSION_EFFECT_HEADER)).toBe(effect);
    expect(response.headers.has("set-cookie")).toBeFalse();
    expect(response.headers.has("x-untrusted-provider-header")).toBeFalse();
    expect(await response.json()).toEqual({});
});

test("node response bridge preserves native resource metadata without accepting security headers", async () => {
    const metadata = JSON.stringify({ status: 302, headers: { location: "/login" } });
    const incoming = Readable.from([]);
    Object.assign(incoming, {
        statusCode: 200,
        headers: {
            [RESOURCE_HEADER]: metadata,
            "content-type": "application/octet-stream",
            "content-security-policy": "unsafe",
        },
    });
    const response = toResponse(incoming as IncomingMessage, "GET");
    expect(response.headers.get(RESOURCE_HEADER)).toBe(metadata);
    expect(response.headers.has("content-security-policy")).toBe(false);
    expect(await response.text()).toBe("");
});
