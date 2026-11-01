import { expect, test } from "bun:test";
import { ResponseCache } from "../../src/runtime/resources/cache/ResponseCache";
import { request } from "./fixture";

test("cacheable no-transform streams deliver the first chunk immediately without filling the cache", async () => {
    const cache = new ResponseCache();
    let cancelled = false;
    const response = await cache.handle(request(), async () => ({
        cacheControl: "public, max-age=60, no-transform",
        response: new Response(
            new ReadableStream({
                start: (controller) => controller.enqueue(new TextEncoder().encode("hero")),
                cancel() {
                    cancelled = true;
                },
            }),
            { headers: { "content-type": "text/html", "cache-control": "public, max-age=60, no-transform" } },
        ),
    }));
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe("hero");
    expect(cache.snapshot().entries).toBe(0);
    await reader.cancel();
    expect(cancelled).toBe(true);
});
test("unknown Vary dimensions bypass storage and write preconditions bypass shared reads", async () => {
    const cache = new ResponseCache();
    let calls = 0;
    const load = async () => {
        calls++;
        return {
            cacheControl: "public, max-age=60",
            response: new Response("page", {
                headers: { "content-type": "text/html", "cache-control": "public, max-age=60", vary: "X-Project" },
            }),
        };
    };
    for (let index = 0; index < 2; index++) {
        await (await cache.handle(request(), load)).text();
    }
    expect(cache.snapshot().entries).toBe(0);
    expect(calls).toBe(2);
    for (const name of ["if-match", "if-unmodified-since", "if-modified-since"]) {
        const response = await cache.handle(request("/page", { [name]: "condition" }), load);
        expect(response.headers.get("x-cache")).toBe("BYPASS");
        await response.text();
    }
});

test("resource Request URLs keep origins and raw query representations isolated in the shared cache", async () => {
    const cache = new ResponseCache();
    let calls = 0;
    const load = async (request: Request) => {
        calls++;
        return {
            cacheControl: "public, max-age=60",
            response: new Response(request.url, {
                headers: { "content-type": "text/plain", "cache-control": "public, max-age=60" },
            }),
        };
    };
    for (const url of ["https://one.test/page?q=+", "https://two.test/page?q=+", "https://one.test/page?q=%20"]) {
        expect(await (await cache.handle(new Request(url), load)).text()).toBe(url);
        expect(await (await cache.handle(new Request(url), load)).text()).toBe(url);
    }
    expect(calls).toBe(3);
    expect(cache.snapshot().entries).toBe(3);
});
