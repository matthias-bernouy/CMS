import { describe, expect, test } from "bun:test";
import type { SourceEndpoint } from "@bernouy/cms-sources";
import {
    DefaultSourceImageMediaCoordinator,
    InMemorySourceImageCache,
    InMemorySourceImageJobQueue,
    InMemorySourceMediaIndex,
    SOURCE_RESPONSIVE_WEBP_V1,
} from "@bernouy/cms-source-images";

describe("Source media effect coordination", () => {
    test("turns an upload UUID into one all-variant critical job", async () => {
        const fixture = coordinator();

        await fixture.coordinator.recordEffects(
            uploadEndpoint(),
            Response.json({ id: "9c9ad87e-866c-4db5-b7ab-b1c979a3db54", version: 3, width: 4_500, height: 3_000 }),
        );

        const claim = await fixture.queue.claim({
            owner: "worker",
            now: Date.now(),
            leaseMs: 1_000,
            priorities: ["media-critical"],
        });
        expect(claim?.job.variants.map(({ width }) => width)).toEqual(SOURCE_RESPONSIVE_WEBP_V1.widths);
        expect(claim?.job.source.url).toContain("publicPhoto?id=9c9ad87e-866c-4db5-b7ab-b1c979a3db54");
        expect(claim?.job.asset).toBeDefined();

        const context = await fixture.coordinator.resolveRequest(
            publicPhotoEndpoint(),
            new Request(
                "https://site.test/.cms/sources/photos/publicPhoto?id=9c9ad87e-866c-4db5-b7ab-b1c979a3db54&cms-width=384",
            ),
        );
        expect(context).toEqual({ asset: claim?.job.asset, logicalKey: claim?.job.logicalKey });
    });

    test("revisions fence an older job and removals delete the global index entry", async () => {
        const fixture = coordinator();
        const response = (version: number) => Response.json({ id: 42, version, width: 2_000, height: 1_200 });
        await fixture.coordinator.recordEffects(uploadEndpoint(), response(1));
        const old = await fixture.queue.claim({
            owner: "old",
            now: Date.now(),
            leaseMs: 60_000,
            priorities: ["media-critical"],
        });
        await fixture.coordinator.recordEffects(uploadEndpoint(), response(2));
        expect(await fixture.index.isCurrent(old!.job.asset!.key, old!.job.asset!.generation)).toBeFalse();
        const replacement = await fixture.queue.claim({
            owner: "new",
            now: Date.now(),
            leaseMs: 60_000,
            priorities: ["media-critical"],
        });
        expect(replacement?.job.logicalKey).not.toBe(old?.job.logicalKey);

        await fixture.coordinator.recordEffects(removeEndpoint(), Response.json({ photoId: 42, removed: true }));
        expect(await fixture.index.get(old!.job.asset!.key)).toBeNull();
    });
});

function coordinator() {
    const queue = new InMemorySourceImageJobQueue();
    const index = new InMemorySourceMediaIndex();
    const coordinator = new DefaultSourceImageMediaCoordinator({
        scope: "https://site.test",
        index,
        scheduler: queue,
        cache: new InMemorySourceImageCache(),
        recipe: SOURCE_RESPONSIVE_WEBP_V1,
        encoderIdentity: "test-webp-v1",
        resolveEndpoint: async (_sourceId, endpointId) => (endpointId === "publicPhoto" ? publicPhotoEndpoint() : null),
        resolveInstallationId: async () => "installation-1",
        clock: () => 1_000,
    });
    return { coordinator, index, queue };
}

function uploadEndpoint(): SourceEndpoint {
    return {
        urn: "urn:photos:uploadPhoto",
        method: "POST",
        targetUrl: "https://connector.test/upload",
        effects: {
            producesMedia: [
                {
                    version: 1,
                    kind: "image",
                    targetEndpoint: "publicPhoto",
                    params: { id: { responsePath: "id" } },
                    revision: { responsePath: "version" },
                    width: { responsePath: "width" },
                    height: { responsePath: "height" },
                },
            ],
        },
        output: [{ status: "200" }],
    };
}

function removeEndpoint(): SourceEndpoint {
    return {
        urn: "urn:photos:removePhoto",
        method: "POST",
        targetUrl: "https://connector.test/remove",
        effects: {
            removesMedia: [
                {
                    version: 1,
                    kind: "image",
                    targetEndpoint: "publicPhoto",
                    params: { id: { responsePath: "photoId" } },
                },
            ],
        },
        output: [{ status: "200" }],
    };
}

function publicPhotoEndpoint(): SourceEndpoint {
    return {
        urn: "urn:photos:publicPhoto",
        method: "GET",
        targetUrl: "https://connector.test/photo",
        access: { mode: "public" },
        responseKind: "file",
        mediaType: "image/*",
        input: { params: [{ name: "id", in: "query", required: true, schema: { type: "string" } }] },
        output: [{ status: "200" }],
    };
}
