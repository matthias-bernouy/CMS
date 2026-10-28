import { expect, test } from "bun:test";
import { resourceHttpResponse } from "@bernouy/cms-edge";
import type { GatewayResult } from "@bernouy/cms-gateway";
function result(body = "page", headers: Record<string, string> = {}, status = 200): GatewayResult {
    return {
        kind: "binary",
        requestId: crypto.randomUUID(),
        stream: new Response(body).body!,
        contentType: "application/octet-stream",
        resource: { status, headers: { "content-type": "text/html", ...headers } },
    };
}
test("Edge controls CSP, framing and cache privacy", async () => {
    for (const kind of ["user", "administrator"] as const) {
        const response = await resourceHttpResponse(
            result("page", { "cache-control": "public, max-age=31536000, immutable" }),
            new Request("https://site.test/admin"),
            { kind, subjectId: "alias" },
            { csp: { connectExtras: [], mediaExtras: [], frameExtras: ["https://maps.test"] } },
        );
        expect(response.headers.get("cache-control")).toBe("private, no-store");
        expect(response.headers.get("content-security-policy")).toContain("frame-src 'self' https://maps.test");
        expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
        expect(response.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    }
});
test("untrusted security metadata is rejected and its stream is cancelled", async () => {
    let cancelled = false;
    const value = result();
    if (value.kind !== "binary") {
        throw new Error("binary");
    }
    const stream = new ReadableStream<Uint8Array>({
        cancel() {
            cancelled = true;
        },
    });
    await expect(
        resourceHttpResponse(
            { ...value, stream, resource: { status: 200, headers: { "set-cookie": "secret" } } },
            new Request("https://site.test/"),
            { kind: "anonymous" },
        ),
    ).rejects.toThrow();
    expect(cancelled).toBe(true);
});
test("HEAD and not-modified responses complete empty streams without creating a body", async () => {
    for (const status of [200, 304, 302]) {
        const value = result("", status === 302 ? { location: "/next" } : {}, status);
        const response = await resourceHttpResponse(value, new Request("https://site.test/", { method: "HEAD" }), {
            kind: "anonymous",
        });
        expect(response.status).toBe(status);
        expect(response.body).toBeNull();
        expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self'");
    }
});
test("Edge compresses text streams and leaves ranges unchanged", async () => {
    const request = new Request("https://site.test/", { headers: { "accept-encoding": "gzip" } });
    const response = await resourceHttpResponse(
        result("hello", { etag: '"identity"', "cache-control": "public, no-cache" }),
        request,
        { kind: "anonymous" },
    );
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(await new Response(response.body!.pipeThrough(new DecompressionStream("gzip"))).text()).toBe("hello");
    expect(response.headers.get("etag")).toBe('W/"identity"');
    const range = await resourceHttpResponse(
        result("ab", { "content-type": "text/plain", "content-range": "bytes 0-1/8", "content-length": "2" }, 206),
        request,
        { kind: "anonymous" },
    );
    expect(range.headers.get("content-encoding")).toBeNull();
    expect(await range.text()).toBe("ab");
});
