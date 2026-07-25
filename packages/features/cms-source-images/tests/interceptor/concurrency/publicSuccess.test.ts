import { describe, expect, mock, test } from "bun:test";
import {
    FakeImageTransformer,
    fakeWebP,
    interceptorHarness,
    invoke,
    sourceRequest,
    upstreamImage,
} from "../../helpers/interceptorHarness";

describe("Source image public single-flight success", () => {
    test("coalesces a cold miss before upstream, decode, and encode", async () => {
        const transformer = new FakeImageTransformer();
        transformer.delayMs = 15;
        const harness = interceptorHarness({ transformer });
        const next = mock(async () => {
            await Bun.sleep(10);
            return upstreamImage();
        });
        const responses = await Promise.all(
            Array.from({ length: 12 }, () => invoke(harness.interceptor, harness.endpoint, sourceRequest(), next)),
        );
        const bodies = await Promise.all(responses.map((response) => response.arrayBuffer()));

        expect(responses.every((response) => response.status === 200)).toBe(true);
        expect(bodies.every((body) => body.byteLength > 0)).toBe(true);
        expect(next).toHaveBeenCalledTimes(1);
        expect(transformer.inspectCalls).toBe(1);
        expect(transformer.transformCalls).toBe(1);
        expect(harness.observations).toHaveLength(12);
        expect(harness.observations.filter((item) => item.joinedSingleFlight)).toHaveLength(11);
    });

    test("renders each joined conditional response from the shared derivative", async () => {
        const transformer = new FakeImageTransformer();
        transformer.delayMs = 15;
        const harness = interceptorHarness({ transformer });
        const next = mock(async () => {
            await Bun.sleep(10);
            return upstreamImage();
        });
        const etag = await fakeEtag(fakeWebP(384));

        const [regular, conditional] = await Promise.all([
            invoke(harness.interceptor, harness.endpoint, sourceRequest(), next),
            invoke(
                harness.interceptor,
                harness.endpoint,
                sourceRequest(384, { headers: { "If-None-Match": etag } }),
                next,
            ),
        ]);

        expect(regular.status).toBe(200);
        expect((await regular.arrayBuffer()).byteLength).toBeGreaterThan(0);
        expect(conditional.status).toBe(304);
        expect(await conditional.text()).toBe("");
        expect(next).toHaveBeenCalledTimes(1);
        expect(transformer.inspectCalls).toBe(1);
        expect(transformer.transformCalls).toBe(1);
        expect(harness.observations).toHaveLength(2);
        expect(harness.observations.filter((item) => item.joinedSingleFlight)).toHaveLength(1);
    });

    test("ignores non-forwarded caller headers when joining a public wave", async () => {
        const transformer = new FakeImageTransformer();
        transformer.delayMs = 15;
        const harness = interceptorHarness({ transformer });
        const next = mock(async () => {
            await Bun.sleep(10);
            return upstreamImage();
        });

        const responses = await Promise.all([
            invoke(
                harness.interceptor,
                harness.endpoint,
                sourceRequest(384, {
                    headers: {
                        Authorization: "Bearer caller-a",
                        Cookie: "session=a",
                        Origin: "https://a.test",
                        "User-Agent": "agent-a",
                    },
                }),
                next,
            ),
            invoke(
                harness.interceptor,
                harness.endpoint,
                sourceRequest(384, {
                    headers: {
                        Authorization: "Bearer caller-b",
                        Cookie: "session=b",
                        Origin: "https://b.test",
                        "User-Agent": "agent-b",
                    },
                }),
                next,
            ),
        ]);

        expect(responses.every((response) => response.status === 200)).toBe(true);
        expect(next).toHaveBeenCalledTimes(1);
        expect(transformer.inspectCalls).toBe(1);
        expect(transformer.transformCalls).toBe(1);
    });

    test("does not join different forwarded Content-Type values", async () => {
        const transformer = new FakeImageTransformer();
        transformer.delayMs = 15;
        const harness = interceptorHarness({ transformer });
        const next = mock(async () => {
            await Bun.sleep(10);
            return upstreamImage({ cacheControl: "public, max-age=0" });
        });

        await Promise.all([
            invoke(
                harness.interceptor,
                harness.endpoint,
                sourceRequest(384, { headers: { "Content-Type": "application/a" } }),
                next,
            ),
            invoke(
                harness.interceptor,
                harness.endpoint,
                sourceRequest(384, { headers: { "Content-Type": "application/b" } }),
                next,
            ),
        ]);

        expect(next).toHaveBeenCalledTimes(2);
        expect(transformer.inspectCalls).toBe(2);
    });
});

async function fakeEtag(bytes: Uint8Array): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes.slice().buffer));
    const hex = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `"sha256-${hex}"`;
}
