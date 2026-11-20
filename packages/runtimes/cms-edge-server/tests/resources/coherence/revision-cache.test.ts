import { expect, test } from "bun:test";
import { ResponseCache } from "../../../src/runtime/resources/cache/ResponseCache";
import { request, resource, barrier } from "../fixture";
const DAY = 24 * 60 * 60_000;

function fixture() {
    let now = 0;
    let revision = "one";
    let calls = 0;
    const cache = new ResponseCache({ now: () => now, validatedRevision: () => revision });
    const load = async () => {
        calls++;
        const result = resource(`Page ${revision}`);
        result.response.headers.set("etag", `"${revision}"`);
        return { ...result, tags: ["content:pages", `content:revision-validated:${revision}`] };
    };
    return {
        cache,
        load,
        calls: () => calls,
        time: (value: number) => {
            now = value;
        },
        revision: (value: string) => {
            revision = value;
        },
    };
}
test("revision-validated public Pages retain bytes for 24 hours of inactivity and renew on use", async () => {
    const f = fixture();
    await f.cache.handle(request(), f.load);
    for (const hour of [23, 46, 69]) {
        f.time(hour * 60 * 60_000);
        const hit = await f.cache.handle(request(), f.load);
        expect(hit.headers.get("x-cache")).toBe("HIT");
        expect(await hit.text()).toBe("Page one");
    }
    expect(f.calls()).toBe(1);
    f.time(93 * 60 * 60_000);
    expect((await f.cache.handle(request(), f.load)).headers.get("x-cache")).toBe("MISS");
    expect(f.calls()).toBe(2);
});
test("reload directives revalidate against the checked revision and honor ETags, HEAD and refusal headers", async () => {
    const f = fixture();
    await f.cache.handle(request(), f.load);
    f.time(DAY - 1);
    for (const headers of [
        { "cache-control": "no-cache", pragma: "no-cache" },
        { "cache-control": "max-age=0" },
        { "cache-control": "NO-CACHE, max-age=0" },
        { pragma: "no-cache" },
    ]) {
        const response = await f.cache.handle(request("/page", { ...headers, "if-none-match": '"one"' }), f.load);
        expect(response.status).toBe(304);
        expect(response.body).toBeNull();
        expect(response.headers.get("x-cache")).toBe("REVALIDATED");
    }
    expect((await f.cache.handle(request("/page", { "cache-control": "no-cache" }, "HEAD"), f.load)).body).toBeNull();
    expect(f.calls()).toBe(1);
    for (const headers of [
        { "cache-control": "no-store" },
        { "cache-control": "no-cache, no-store" },
        { "cache-control": "unknown" },
        { pragma: "unknown" },
        { cookie: "cms-session=private" },
        { authorization: "Bearer private" },
    ]) {
        expect((await f.cache.handle(request("/page", headers), f.load)).headers.get("x-cache")).toBe("BYPASS");
    }
});
test("a changed revision cannot reuse old public bytes or return a false 304", async () => {
    const f = fixture();
    await f.cache.handle(request(), f.load);
    f.revision("two");
    const response = await f.cache.handle(
        request("/page", { "cache-control": "no-cache", "if-none-match": '"one"' }),
        f.load,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("Page two");
    expect(response.headers.get("x-cache")).toBe("BYPASS");
    expect(f.cache.snapshot().entries).toBe(0);
});
test("missing static evidence or missing a hosting proof preserves the ordinary short lifetime", async () => {
    for (const mode of ["no-static-tag", "no-hosting-proof", "foreign-clock"]) {
        let now = 0;
        let calls = 0;
        const cache = new ResponseCache({
            now: () => now,
            ...(mode !== "no-hosting-proof" ? { validatedRevision: () => "one" } : {}),
        });
        const load = async () => ({
            ...resource(String(++calls)),
            tags:
                mode === "no-static-tag"
                    ? ["content:pages"]
                    : [`content:revision-validated:${mode === "foreign-clock" ? "foreign" : "one"}`],
        });
        await cache.handle(request(), load);
        expect(
            (await cache.handle(request("/page", { "cache-control": "no-cache" }), load)).headers.get("x-cache"),
        ).toBe("BYPASS");
        now = 16_000;
        expect((await cache.handle(request(), load)).headers.get("x-cache")).toBe("MISS");
        expect(calls).toBe(3);
    }
});
test("a changed revision fences a pending fill and never extends a failed or private response", async () => {
    const f = fixture();
    const gate = barrier();
    const pending = f.cache.handle(request(), async () => {
        const value = await f.load();
        await gate.promise;
        return value;
    });
    await Promise.resolve();
    f.revision("two");
    f.cache.purge();
    gate.release();
    await pending;
    expect(f.cache.snapshot().entries).toBe(0);
    for (const status of [403, 503]) {
        await f.cache.handle(request(), async () => ({
            ...resource("failure", "private, no-store", status),
            tags: ["content:revision-validated:two"],
        }));
        expect(f.cache.snapshot().entries).toBe(0);
    }
});
