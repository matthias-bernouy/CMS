import { describe, expect, mock, test } from "bun:test";
import { executeEndpoint } from "@bernouy/cms-sources";
import { interceptorHarness, invoke, sourceRequest, upstreamImage } from "../../helpers/interceptorHarness";

describe("Source image connector response caching", () => {
    test("reuses a public derivative without connector trust configuration", async () => {
        const harness = interceptorHarness();
        const fetchImpl = mock(async () =>
            upstreamImage({
                cacheControl: "public, max-age=31536000, immutable",
                headers: {
                    "Set-Cookie": "infrastructure-cookie=opaque; Path=/; HttpOnly",
                    Vary: "Accept-Encoding",
                },
            }),
        );
        const next = mock((request: Request) => executeEndpoint(harness.endpoint, request, { fetchImpl }));

        const first = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        const second = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);

        expect(first.headers.get("cache-control")).toBe("public, max-age=31536000, immutable, must-revalidate");
        expect(first.headers.get("set-cookie")).toBeNull();
        expect(second.headers.get("cache-control")).toBe("public, max-age=31536000, immutable, must-revalidate");
        expect(next).toHaveBeenCalledTimes(1);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        expect(harness.transformer.inspectCalls).toBe(1);
        expect(harness.transformer.transformCalls).toBe(1);
        expect(harness.cache.lookupCount).toBe(1);
    });
});
