import { describe, expect, mock, test } from "bun:test";
import { createDisabledSourceImageInterceptor, type SourceImageObservation } from "@bernouy/cms-source-images";
import { imageEndpoint, sourceRequest } from "../helpers/interceptorHarness";

describe("disabled Source image transforms", () => {
    test("fails stale responsive candidates closed instead of returning an original under a false descriptor", async () => {
        const interceptor = createDisabledSourceImageInterceptor();
        const next = mock(
            async () =>
                new Response(new Uint8Array([1, 2, 3]), {
                    headers: { "content-type": "image/jpeg" },
                }),
        );

        const response = await interceptor(imageEndpoint(), sourceRequest(384), next);

        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(next).toHaveBeenCalledTimes(0);
    });

    test("rejects every reserved parameter while disabled", async () => {
        const observations: SourceImageObservation[] = [];
        const interceptor = createDisabledSourceImageInterceptor((observation) => observations.push(observation));
        const next = mock(async () => new Response("original"));
        for (const suffix of ["cms-width=64", "cms-height=64", "cms-width=64&cms-width=128", "CMS-WIDTH=64"]) {
            const response = await interceptor(
                imageEndpoint(),
                new Request(`https://cms.test/.cms/sources/commerce/image?id=private-media-42&token=secret&${suffix}`, {
                    headers: {
                        authorization: "Bearer private-token",
                        cookie: "session=private-session",
                    },
                }),
                next,
            );
            expect(response.status).toBe(503);
            expect(response.headers.get("cache-control")).toBe("no-store");
        }
        expect(next).toHaveBeenCalledTimes(0);
        expect(observations).toEqual(
            Array.from({ length: 4 }, () => ({
                outcome: "rejected",
                reason: "transforms_disabled",
                stagesMs: {},
            })),
        );
        const serialized = JSON.stringify(observations);
        expect(serialized).not.toContain("private-media-42");
        expect(serialized).not.toContain("private-token");
        expect(serialized).not.toContain("private-session");
        expect(serialized).not.toContain("secret");
    });

    test("keeps the disabled response unchanged when its observer fails", async () => {
        const interceptor = createDisabledSourceImageInterceptor(() => {
            throw new Error("telemetry unavailable");
        });
        const next = mock(async () => new Response("original"));

        const response = await interceptor(imageEndpoint(), sourceRequest(384), next);

        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(next).toHaveBeenCalledTimes(0);
    });

    test("preserves exact passthrough when no CMS transform is requested", async () => {
        const interceptor = createDisabledSourceImageInterceptor();
        const url = new URL(sourceRequest().url);
        url.searchParams.delete("cms-width");
        const request = new Request(url);
        const expected = new Response("original", { headers: { "x-original": "kept" } });
        const next = mock(async () => expected);

        const response = await interceptor(imageEndpoint(), request, next);

        expect(response).toBe(expected);
        expect(next).toHaveBeenCalledWith(request);
    });
});
