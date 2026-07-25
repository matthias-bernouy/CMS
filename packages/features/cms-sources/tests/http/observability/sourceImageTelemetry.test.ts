import { describe, expect, test } from "bun:test";
import { handleSourceRequest, measureActiveSourceTiming, type SourceRequestObservation } from "@bernouy/cms-sources";
import { okFetch, seededSourceRepository, SOURCE_PREFIX } from "../handleSourceFixtures";

describe("source image request telemetry", () => {
    test("records the six privacy-safe image pipeline stages inside the active Source request", async () => {
        const observations: SourceRequestObservation[] = [];
        let clock = 0;
        const response = await handleSourceRequest(
            await seededSourceRepository(),
            new Request(`http://local${SOURCE_PREFIX}shop/getCart`),
            {
                prefix: SOURCE_PREFIX,
                deps: {
                    fetchImpl: okFetch(),
                    interceptEndpoint: async (_endpoint, request, next) => {
                        const stages = [
                            "cms_image_upstream",
                            "cms_image_read",
                            "cms_image_decode",
                            "cms_image_semaphore_wait",
                            "cms_image_encode",
                            "cms_image_store",
                        ] as const;
                        for (const stage of stages) {
                            await measureActiveSourceTiming(request, stage, async () => undefined);
                        }
                        return next(request);
                    },
                    telemetry: {
                        clock: () => ++clock,
                        observe: (observation) => observations.push(observation),
                    },
                },
            },
        );

        expect(response.status).toBe(200);
        expect(observations).toHaveLength(1);
        expect(observations[0]?.stagesMs).toEqual(
            expect.objectContaining({
                cms_image_upstream: 1,
                cms_image_read: 1,
                cms_image_decode: 1,
                cms_image_semaphore_wait: 1,
                cms_image_encode: 1,
                cms_image_store: 1,
            }),
        );
    });
});
