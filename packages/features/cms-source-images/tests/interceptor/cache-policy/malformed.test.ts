import { describe, expect, mock, test } from "bun:test";
import { interceptorHarness, invoke, sourceRequest, upstreamImage } from "../../helpers/interceptorHarness";

describe("Source image malformed cache freshness", () => {
    test.each([
        "public, max-age=0, max-age=3600",
        "public, max-age=3600, max-age=3600",
        "public, max-age=3600, s-maxage=invalid",
        "public, max-age=3600, s-maxage=0, s-maxage=3600",
        'public, max-age=3600, extension="unterminated',
        'public, max-age="0, max-age=3600"',
        "public=allowed, max-age=3600",
        "public, max-age=3600,, immutable",
    ])("fails closed for ambiguous freshness policy %s", async (cacheControl) => {
        const harness = interceptorHarness();
        const next = mock(async () => upstreamImage({ cacheControl }));

        const first = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        const second = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);

        expect(first.headers.get("cache-control")).toBe("private, no-store");
        expect(second.headers.get("cache-control")).toBe("private, no-store");
        expect(next).toHaveBeenCalledTimes(2);
    });

    test.each(["invalid", "-1", "1.5", "0, 100"])("fails closed for invalid or non-unique Age %s", async (age) => {
        const harness = interceptorHarness();
        const next = mock(async () =>
            upstreamImage({
                cacheControl: "public, max-age=3600",
                headers: { Age: age },
            }),
        );

        const first = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);
        const second = await invoke(harness.interceptor, harness.endpoint, sourceRequest(), next);

        expect(first.headers.get("cache-control")).toBe("private, no-store");
        expect(second.headers.get("cache-control")).toBe("private, no-store");
        expect(next).toHaveBeenCalledTimes(2);
    });
});
