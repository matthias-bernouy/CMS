import { describe, expect, mock, test } from "bun:test";
import { interceptorHarness, invoke, sourceRequest, upstreamImage } from "../helpers/interceptorHarness";

describe("Source image authorization boundary", () => {
    test.each(["auth", "admin"] as const)("reexecutes %s upstream authorization on every request", async (access) => {
        const harness = interceptorHarness({ access });
        await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);
        await invoke(harness.interceptor, harness.endpoint, sourceRequest(), harness.next);
        expect(harness.next).toHaveBeenCalledTimes(2);
        expect(harness.transformer.inspectCalls).toBe(2);
        expect(harness.transformer.transformCalls).toBe(1);
        expect(harness.observations[1]).toMatchObject({
            outcome: "cache_hit",
            policy: "private",
            cache: "hit",
        });
    });

    test("does not serve a private derivative after object authorization is revoked", async () => {
        const harness = interceptorHarness({ access: "auth" });
        let authorized = true;
        const next = mock(async () =>
            authorized
                ? upstreamImage({ cacheControl: "private, max-age=60" })
                : new Response("Not Found", { status: 404 }),
        );
        expect((await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next)).status).toBe(200);
        authorized = false;
        const denied = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        expect(denied.status).toBe(404);
        expect(await denied.text()).toBe("Not Found");
        expect(next).toHaveBeenCalledTimes(2);
    });

    test("performs upstream object authorization before private 304", async () => {
        const harness = interceptorHarness({ access: "auth" });
        const firstRequest = sourceRequest(384, { headers: { Authorization: "Bearer subject-a" } });
        const first = await invoke(harness.interceptor, harness.endpoint, firstRequest, harness.next);
        const conditional = sourceRequest(384, {
            headers: {
                Authorization: "Bearer subject-a",
                "If-None-Match": first.headers.get("etag")!,
            },
        });
        const response = await invoke(harness.interceptor, harness.endpoint, conditional, harness.next);
        expect(response.status).toBe(304);
        expect(harness.next).toHaveBeenCalledTimes(2);
        expect(harness.transformer.transformCalls).toBe(1);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
    });

    test("partitions private request identity by opaque authorization material", async () => {
        const harness = interceptorHarness({ access: "auth" });
        const first = sourceRequest(384, { headers: { Authorization: "Bearer a" } });
        const second = sourceRequest(384, { headers: { Authorization: "Bearer b" } });
        await invoke(harness.interceptor, harness.endpoint, first, harness.next);
        await invoke(harness.interceptor, harness.endpoint, second, harness.next);
        expect(harness.transformer.transformCalls).toBe(2);
        expect(harness.cache.derivativeCount).toBe(2);
        expect(harness.cache.lookupCount).toBe(0);
    });

    test("does not expose identifiers or credentials in observations", async () => {
        const harness = interceptorHarness({ access: "auth" });
        const request = sourceRequest(384, {
            headers: { Authorization: "Bearer top-secret", Cookie: "session=private" },
        });
        await invoke(harness.interceptor, harness.endpoint, request, harness.next);
        const serialized = JSON.stringify(harness.observations);
        expect(serialized).not.toContain("offer-1");
        expect(serialized).not.toContain("top-secret");
        expect(serialized).not.toContain("session");
        expect(harness.observations[0]).toMatchObject({
            outcome: "generated",
            policy: "private",
            width: 384,
        });
    });
});
