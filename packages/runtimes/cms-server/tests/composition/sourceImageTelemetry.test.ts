import { describe, expect, mock, test } from "bun:test";
import type { SourceImageObservation } from "@bernouy/cms-source-images";
import type { SourceEndpoint } from "@bernouy/cms-sources";
import {
    createRuntimeSourceImageComposition,
    createSourceImageTelemetryObserver,
} from "../../src/runtime/sourceImageTelemetry";

const routineObservation = (): SourceImageObservation => ({
    outcome: "generated",
    policy: "public",
    width: 512,
    cache: "miss",
    joinedSingleFlight: false,
    stagesMs: { upstream: 20, read: 2, decode: 4, semaphore_wait: 1, encode: 30, store: 3 },
    sourceBytes: 1_000_000,
    outputBytes: 80_000,
    compressionRatio: 0.08,
});

describe("Source image runtime telemetry", () => {
    test("samples routine observations with the Source timing rate", () => {
        const logs: string[] = [];
        const skipped = createSourceImageTelemetryObserver({
            sampleRate: 0.25,
            random: () => 0.5,
            report: (message) => logs.push(message),
        });
        const sampled = createSourceImageTelemetryObserver({
            sampleRate: 0.25,
            random: () => 0.2,
            report: (message) => logs.push(message),
        });

        skipped(routineObservation());
        sampled(routineObservation());

        expect(logs).toHaveLength(1);
        expect(JSON.parse(logs[0]!)).toEqual({
            event: "cms_source_image",
            outcome: "generated",
            policy: "public",
            width: 512,
            cache: "miss",
            joinedSingleFlight: false,
            stagesMs: { upstream: 20, read: 2, decode: 4, semaphore_wait: 1, encode: 30, store: 3 },
            sourceBytes: 1_000_000,
            outputBytes: 80_000,
            compressionRatio: 0.08,
        });
    });

    test("always reports upstream responses, rejections, failures, fallbacks, evictions, and cache errors", () => {
        const logs: string[] = [];
        const observe = createSourceImageTelemetryObserver({
            sampleRate: 0,
            random: () => 1,
            report: (message) => logs.push(message),
        });

        for (const observation of [
            { outcome: "upstream_response", reason: "upstream_status", stagesMs: { upstream: 3 } },
            { outcome: "rejected", reason: "invalid_width", stagesMs: {} },
            { outcome: "failed", reason: "processing_failed", stagesMs: {} },
            { outcome: "fallback", reason: "semaphore_saturated", stagesMs: {} },
            { outcome: "cache_hit", cache: "hit", evicted: 2, stagesMs: {} },
            { outcome: "generated", cache: "miss", cacheErrors: 1, stagesMs: {} },
        ] satisfies SourceImageObservation[]) {
            observe(observation);
        }

        expect(logs.map((line) => JSON.parse(line).outcome)).toEqual([
            "upstream_response",
            "rejected",
            "failed",
            "fallback",
            "cache_hit",
            "generated",
        ]);
        expect(JSON.parse(logs.at(-1)!).cacheErrors).toBe(1);
    });

    test("reports disabled transform rejections through the privacy-safe runtime observer", async () => {
        const logs: string[] = [];
        const composition = await createRuntimeSourceImageComposition({
            cache: null,
            transformsEnabled: false,
            responsivePublicMarkupEnabled: true,
            responsivePrivateMarkupEnabled: true,
            scope: "site-test",
            sampleRate: 0,
            report: (message) => logs.push(message),
        });
        const next = mock(async () => new Response("original"));
        const request = new Request(
            "https://cms.test/.cms/sources/commerce/image?id=private-media&token=private-secret&cms-width=384",
            {
                headers: {
                    authorization: "Bearer private-token",
                    cookie: "session=private-session",
                },
            },
        );

        const response = await composition.sourceImageInterceptor(disabledImageEndpoint(), request, next);

        expect(response.status).toBe(503);
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(next).toHaveBeenCalledTimes(0);
        expect(composition.responsivePublicSourceImagesEnabled).toBe(false);
        expect(composition.responsivePrivateSourceImagesEnabled).toBe(false);
        expect(logs).toHaveLength(1);
        expect(JSON.parse(logs[0]!)).toEqual({
            event: "cms_source_image",
            outcome: "rejected",
            reason: "transforms_disabled",
            stagesMs: {},
        });
        expect(logs[0]).not.toContain("private-media");
        expect(logs[0]).not.toContain("private-secret");
        expect(logs[0]).not.toContain("private-token");
        expect(logs[0]).not.toContain("private-session");
    });

    test("serializes only the closed privacy-safe contract", () => {
        const logs: string[] = [];
        const observe = createSourceImageTelemetryObserver({
            sampleRate: 1,
            report: (message) => logs.push(message),
        });
        observe({
            ...routineObservation(),
            url: "https://storage.example/private/object",
            endpointId: "seller-media",
            mediaId: "media-secret",
            authorization: "Bearer secret",
        } as SourceImageObservation);

        expect(logs[0]).not.toContain("storage.example");
        expect(logs[0]).not.toContain("seller-media");
        expect(logs[0]).not.toContain("media-secret");
        expect(logs[0]).not.toContain("Bearer");
        expect(Object.keys(JSON.parse(logs[0]!))).toEqual([
            "event",
            "outcome",
            "policy",
            "width",
            "cache",
            "joinedSingleFlight",
            "stagesMs",
            "sourceBytes",
            "outputBytes",
            "compressionRatio",
        ]);
    });
});

function disabledImageEndpoint(): SourceEndpoint {
    return {
        urn: "urn:commerce:publicOfferImage",
        method: "GET",
        targetUrl: "https://connector.test/image",
        access: { mode: "public" },
        responseKind: "file",
        mediaType: "image/*",
        output: [{ status: "200" }],
    };
}
