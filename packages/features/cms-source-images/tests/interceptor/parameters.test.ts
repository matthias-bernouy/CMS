import { describe, expect, mock, test } from "bun:test";
import { interceptorHarness, invoke, sourceRequest, upstreamImage } from "../helpers/interceptorHarness";

describe("Source image reserved parameters", () => {
    test.each([65, 320, 640, 999, 9999, "1e3", "-64", "64.0", "064", ""])(
        "rejects unsupported width %s before upstream or cache creation",
        async (width) => {
            const harness = interceptorHarness();
            const response = await invoke(harness.interceptor, harness.endpoint, sourceRequest(width), harness.next);
            expect(response.status).toBe(400);
            expect(harness.next).toHaveBeenCalledTimes(0);
            expect(harness.cache.derivativeCount).toBe(0);
            expect(harness.transformer.transformCalls).toBe(0);
        },
    );

    test("rejects unsupported and duplicate CMS parameters", async () => {
        const harness = interceptorHarness();
        const unsupportedUrl = new URL(sourceRequest().url);
        unsupportedUrl.searchParams.set("cms-height", "100");
        expect(
            (await invoke(harness.interceptor, harness.endpoint, new Request(unsupportedUrl), harness.next)).status,
        ).toBe(400);
        const duplicateUrl = new URL(sourceRequest().url);
        duplicateUrl.searchParams.append("CMS-WIDTH", "384");
        expect(
            (await invoke(harness.interceptor, harness.endpoint, new Request(duplicateUrl), harness.next)).status,
        ).toBe(400);
        expect(harness.next).toHaveBeenCalledTimes(0);
    });

    test("rejects Range transformations before upstream", async () => {
        const harness = interceptorHarness();
        const response = await invoke(
            harness.interceptor,
            harness.endpoint,
            sourceRequest(384, { headers: { Range: "bytes=0-99" } }),
            harness.next,
        );
        expect(response.status).toBe(400);
        expect(await response.text()).toContain("Range");
        expect(harness.next).toHaveBeenCalledTimes(0);
        expect(harness.observations[0]?.reason).toBe("range_request");
    });

    test("removes the canonical cms-width before dispatching upstream", async () => {
        const harness = interceptorHarness();
        const next = mock(async (cleaned: Request) => {
            expect(new URL(cleaned.url).searchParams.get("id")).toBe("offer-1");
            expect([...new URL(cleaned.url).searchParams.keys()]).toEqual(["id"]);
            return upstreamImage();
        });
        expect((await invoke(harness.interceptor, harness.endpoint, sourceRequest(384), next)).status).toBe(200);
        expect(next).toHaveBeenCalledTimes(1);
    });

    test.each(["CMS-WIDTH", " cms-width ", "cms-Width"])(
        "rejects noncanonical reserved name %s without forwarding it",
        async (name) => {
            const harness = interceptorHarness();
            const url = new URL(sourceRequest().url);
            url.searchParams.delete("cms-width");
            url.searchParams.set(name, "384");
            const response = await invoke(harness.interceptor, harness.endpoint, new Request(url), harness.next);
            expect(response.status).toBe(400);
            expect(harness.next).toHaveBeenCalledTimes(0);
        },
    );
});
