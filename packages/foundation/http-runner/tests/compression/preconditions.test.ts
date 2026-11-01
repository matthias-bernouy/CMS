import { expect, test } from "bun:test";
import { evaluateHttpPreconditions, prepareStreamingResponse } from "@bernouy/http-runner";
const modified = "Wed, 21 Oct 2015 07:28:00 GMT";
function check(headers: HeadersInit, method = "GET", etag = '"v1"') {
    return evaluateHttpPreconditions(new Request("https://site.test/", { method, headers }), {
        etag,
        lastModified: modified,
    });
}
test("HTTP preconditions respect strong writes, weak reads and validator precedence", () => {
    expect(check({ "if-none-match": 'W/"v1"' })).toBe(304);
    expect(check({ "if-none-match": '"v1"' }, "PUT")).toBe(412);
    expect(check({ "if-match": 'W/"v1"' }, "PUT")).toBe(412);
    expect(check({ "if-match": '"v1"' }, "PUT")).toBeUndefined();
    expect(check({ "if-match": '"v1"' }, "PUT", 'W/"v1"')).toBe(412);
    expect(check({ "if-modified-since": modified })).toBe(304);
    expect(check({ "if-none-match": '"other"', "if-modified-since": modified })).toBeUndefined();
    expect(check({ "if-unmodified-since": "Wed, 21 Oct 2015 06:28:00 GMT" }, "PUT")).toBe(412);
    expect(
        check({ "if-match": '"v1"', "if-unmodified-since": "Wed, 21 Oct 2015 06:28:00 GMT" }, "PUT"),
    ).toBeUndefined();
    expect(check({ "if-modified-since": "invalid" })).toBeUndefined();
    expect(
        evaluateHttpPreconditions(new Request("https://site.test/", { headers: { "if-none-match": "*" } }), {
            exists: false,
        }),
    ).toBeUndefined();
});
test("a precondition checked inside a revision fence refuses without changing business state", () => {
    let revision = 1;
    const write = (tag: string) => {
        const status = check({ "if-match": tag }, "PUT", `"v${revision}"`);
        if (status) {
            return status;
        }
        revision++;
        return 204;
    };
    expect(write('"v1"')).toBe(204);
    expect(write('"v1"')).toBe(412);
    expect(revision).toBe(2);
});
test("no-transform preserves the first streaming chunk, ETag and identity representation", async () => {
    let cancelled = false;
    const response = await prepareStreamingResponse(
        new Request("https://site.test/", { headers: { "accept-encoding": "gzip" } }),
        new Response(
            new ReadableStream({
                start: (controller) => controller.enqueue(new TextEncoder().encode("hero")),
                cancel() {
                    cancelled = true;
                },
            }),
            { headers: { "content-type": "text/html", "cache-control": "no-store, no-transform", etag: '"v1"' } },
        ),
    );
    expect(response.headers.get("content-encoding")).toBeNull();
    expect(response.headers.get("etag")).toBe('"v1"');
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("hero");
    await reader.cancel();
    expect(cancelled).toBe(true);
});
