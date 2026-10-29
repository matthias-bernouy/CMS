import { expect, test } from "bun:test";
import { acceptsGzip, acceptsIdentity, prepareStreamingResponse } from "@bernouy/http-runner";

test("shared negotiation honors explicit quality, wildcard and identity refusal", () => {
    expect(acceptsGzip("gzip;q=0, *;q=1")).toBe(false);
    expect(acceptsGzip("*;q=1")).toBe(true);
    expect(acceptsIdentity("*;q=0")).toBe(false);
    expect(acceptsIdentity("*;q=0, identity;q=1")).toBe(true);
});

test("streamed gzip is negotiated once and identity validators revalidate its weak representation", async () => {
    const request = new Request("https://site.test/", { headers: { "accept-encoding": "gzip" } });
    const first = await prepareStreamingResponse(
        request,
        new Response("hello", {
            headers: { "content-type": "text/plain", etag: '"version"' },
        }),
    );
    const second = await prepareStreamingResponse(request, first);
    expect(await new Response(second.body!.pipeThrough(new DecompressionStream("gzip"))).text()).toBe("hello");
    expect(second.headers.get("etag")).toBe('W/"version"');
    let cancelled = false;
    const conditional = await prepareStreamingResponse(
        new Request(request, {
            headers: { "accept-encoding": "gzip", "if-none-match": 'W/"version"' },
        }),
        new Response(
            new ReadableStream({
                cancel() {
                    cancelled = true;
                },
            }),
            {
                headers: { "content-type": "text/plain", etag: '"version"' },
            },
        ),
    );
    expect(conditional.status).toBe(304);
    expect(cancelled).toBe(true);
    expect(conditional.headers.get("etag")).toBe('W/"version"');
    expect(conditional.body).toBeNull();
});

test("unacceptable identity returns 406 and cancels the upstream body", async () => {
    let cancelled = false;
    const response = await prepareStreamingResponse(
        new Request("https://site.test/", {
            headers: { "accept-encoding": "identity;q=0" },
        }),
        new Response(
            new ReadableStream({
                cancel() {
                    cancelled = true;
                },
            }),
        ),
    );
    expect(response.status).toBe(406);
    expect(cancelled).toBe(true);
});
