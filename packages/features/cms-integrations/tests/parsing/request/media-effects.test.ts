import { describe, expect, test } from "bun:test";
import { parseIntegrationImportRequest } from "@bernouy/cms-integrations";

describe("integration source media effects", () => {
    test("parses a versioned produced media binding with UUID-compatible response paths", () => {
        const request = parseIntegrationImportRequest({
            definition: definition({
                producesMedia: [
                    {
                        version: 1,
                        kind: "image",
                        targetEndpoint: "publicPhoto",
                        params: { id: { responsePath: "id" } },
                        revision: { responsePath: "revision" },
                        width: { responsePath: "width" },
                        height: { responsePath: "height" },
                        preset: "responsive-webp-v1",
                    },
                ],
            }),
            answers: {},
        });

        expect(request.siteIntegrations[0]?.artifacts?.[0]).toMatchObject({
            source: {
                endpoints: [
                    {
                        endpointId: "upload",
                        effects: {
                            producesMedia: [
                                {
                                    version: 1,
                                    kind: "image",
                                    targetEndpoint: "publicPhoto",
                                    params: { id: { responsePath: "id" } },
                                },
                            ],
                        },
                    },
                ],
            },
        });
    });

    test("parses an optional opaque-cursor inventory contract", () => {
        const request = parseIntegrationImportRequest({
            definition: definition({
                mediaInventory: {
                    version: 1,
                    kind: "image",
                    targetEndpoint: "publicPhoto",
                    itemsPath: "photos",
                    params: { id: { responsePath: "id" } },
                    cursor: { responsePath: "nextCursor", requestParam: "cursor" },
                },
            }),
            answers: {},
        });
        const artifact = request.siteIntegrations[0]?.artifacts?.[0];
        const effects = artifact?.type === "source" ? artifact.source.endpoints[0]?.effects : undefined;

        expect(effects.mediaInventory?.cursor).toEqual({
            responsePath: "nextCursor",
            requestParam: "cursor",
        });
    });

    test("parses a removal identity bound from the mutation request", () => {
        const request = parseIntegrationImportRequest({
            definition: definition({
                removesMedia: [
                    {
                        version: 1,
                        kind: "image",
                        targetEndpoint: "publicPhoto",
                        params: { id: { requestParam: "photoId" } },
                    },
                ],
            }),
            answers: {},
        });
        const artifact = request.siteIntegrations[0]?.artifacts?.[0];
        const effects = artifact?.type === "source" ? artifact.source.endpoints[0]?.effects : undefined;

        expect(effects.removesMedia?.[0]?.params).toEqual({ id: { requestParam: "photoId" } });
    });

    test.each([
        [{ producesMedia: [{ version: 2, kind: "image", targetEndpoint: "photo", params: {} }] }, /version/],
        [{ producesMedia: [{ version: 1, kind: "video", targetEndpoint: "photo", params: {} }] }, /kind/],
        [{ unknownEffect: true }, /unknownEffect.*not supported/],
    ])("rejects malformed or unknown media effects", (effects, expected) => {
        expect(() => parseIntegrationImportRequest({ definition: definition(effects), answers: {} })).toThrow(expected);
    });
});

function definition(effects: Record<string, unknown>) {
    return {
        kind: "media-effects",
        label: "Media effects",
        inputs: [],
        artifacts: [
            {
                type: "source",
                source: {
                    id: "photos",
                    meta: { name: "Photos" },
                    endpoints: [
                        {
                            endpointId: "upload",
                            method: "POST",
                            targetUrl: "https://api.example.test/photos",
                            params: [],
                            effects,
                        },
                    ],
                },
            },
        ],
    };
}
