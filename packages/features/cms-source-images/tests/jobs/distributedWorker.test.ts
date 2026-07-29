import { describe, expect, mock, test } from "bun:test";
import {
    SOURCE_IMAGE_WIDTHS,
    SourceImageJobWorker,
    type SourceImageJob,
    type SourceImageJobScheduler,
} from "@bernouy/cms-source-images";
import { interceptorHarness, invoke, sourceRequest, upstreamImage } from "../helpers/interceptorHarness";

describe("Distributed Source image jobs", () => {
    test("serializes a public miss and warms a shared cache in an independent worker", async () => {
        const jobs: SourceImageJob[] = [];
        const scheduler: SourceImageJobScheduler = {
            enqueue: mock(async (job) => {
                jobs.push(job);
                return "accepted";
            }),
        };
        const harness = interceptorHarness({ jobScheduler: scheduler });
        const request = sourceRequest(128, {
            headers: {
                accept: "image/avif,image/webp",
                authorization: "Bearer secret",
                cookie: "session=secret",
                "x-untrusted": "never-forward",
            },
        });
        const original = mock(async () => upstreamImage());

        const fallback = await invoke(harness.interceptor, harness.endpoint, request, original);

        expect(fallback.status).toBe(200);
        expect(fallback.headers.get("content-type")).toBe("image/png");
        expect(fallback.headers.get("cache-control")).toBe("private, no-store");
        expect(harness.transformer.transformCalls).toBe(0);
        expect(harness.observations.some((item) => item.reason === "job_queued")).toBe(true);
        expect(jobs).toHaveLength(1);
        const serialized = JSON.parse(JSON.stringify(jobs[0])) as SourceImageJob;
        expect(serialized).toEqual(jobs[0]);
        expect(serialized.source.url).toBe("https://cms.test/.cms/sources/commerce/publicOfferImage?id=offer-1");
        expect(serialized.source.headers).toEqual({ accept: "image/avif,image/webp" });
        const fetchSource = mock(async (workerRequest: Request) => {
            expect(workerRequest.headers.get("authorization")).toBeNull();
            expect(workerRequest.headers.get("cookie")).toBeNull();
            return upstreamImage();
        });
        const worker = new SourceImageJobWorker({
            allowedSourceOrigins: ["https://cms.test"],
            cache: harness.cache,
            transformer: harness.transformer,
            fetch: fetchSource,
            clock: () => 1_000,
        });

        const forbidden: SourceImageJob = {
            ...serialized,
            source: { ...serialized.source, url: "https://attacker.test/.cms/sources/photos/image" },
        };
        expect(await worker.handle(forbidden)).toEqual({ disposition: "discarded", reason: "invalid_job" });
        expect(fetchSource).not.toHaveBeenCalled();

        expect(await worker.handle(serialized)).toMatchObject({
            disposition: "completed",
            variants: expect.arrayContaining([expect.objectContaining({ width: 128 })]),
        });
        const warmed = await invoke(harness.interceptor, harness.endpoint, request, original);

        expect(warmed.headers.get("content-type")).toBe("image/webp");
        expect(warmed.headers.get("cache-control")).toStartWith("public, max-age=");
        expect(fetchSource).toHaveBeenCalledTimes(1);
        expect(original).toHaveBeenCalledTimes(1);
        expect(harness.transformer.inspectCalls).toBe(1);
        for (const width of SOURCE_IMAGE_WIDTHS) {
            const variant = await invoke(
                harness.interceptor,
                harness.endpoint,
                sourceRequest(width, { headers: { accept: "image/avif,image/webp" } }),
                original,
            );
            expect(variant.headers.get("content-type")).toBe("image/webp");
        }
        expect(fetchSource).toHaveBeenCalledTimes(1);
        expect(original).toHaveBeenCalledTimes(1);
    });
});
