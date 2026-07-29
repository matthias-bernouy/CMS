import { describe, expect, test } from "bun:test";
import {
    resolveSourceMediaInventoryPage,
    validateSource,
    type Source,
    type SourceEndpoint,
} from "@bernouy/cms-sources";

describe("source media inventory", () => {
    test("uses an opaque nullable cursor without depending on media identifier format", async () => {
        const source = fixture();
        expect(validateSource(source)).toEqual([]);

        const page = await resolveSourceMediaInventoryPage(
            source.endpoints[0]!,
            Response.json({
                photos: [{ id: "0b02c4b7-8228-44dc-b728-f6827c3a8ca8", revision: "etag-1" }],
                nextCursor: "opaque:page:2",
            }),
        );

        expect(page).toEqual({
            items: [
                {
                    action: "produce",
                    sourceId: "photos",
                    targetEndpoint: "publicPhoto",
                    params: { id: "0b02c4b7-8228-44dc-b728-f6827c3a8ca8" },
                    revision: "etag-1",
                },
            ],
            nextCursor: "opaque:page:2",
        });
    });
});

function fixture(): Source {
    const inventory: SourceEndpoint = {
        urn: "urn:photos:mediaInventory",
        method: "GET",
        targetUrl: "https://api.example.test/photos",
        responseKind: "json",
        input: {
            params: [{ name: "cursor", in: "query", schema: { type: "string" } }],
        },
        effects: {
            mediaInventory: {
                version: 1,
                kind: "image",
                targetEndpoint: "publicPhoto",
                itemsPath: "photos",
                params: { id: { responsePath: "id" } },
                revision: { responsePath: "revision" },
                cursor: { requestParam: "cursor", responsePath: "nextCursor" },
            },
        },
        output: [
            {
                status: "200",
                body: {
                    type: "object",
                    properties: {
                        photos: {
                            type: "array",
                            items: {
                                type: "object",
                                properties: {
                                    id: { type: "string" },
                                    revision: { type: "string" },
                                },
                                required: ["id"],
                            },
                        },
                        nextCursor: { type: "string", nullable: true },
                    },
                    required: ["photos"],
                },
            },
        ],
    };
    const image: SourceEndpoint = {
        urn: "urn:photos:publicPhoto",
        method: "GET",
        targetUrl: "https://api.example.test/photos/{id}",
        access: { mode: "public" },
        responseKind: "file",
        mediaType: "image/*",
        input: { params: [{ name: "id", in: "path", required: true, schema: { type: "string" } }] },
        output: [{ status: "200" }],
    };
    return { urn: "urn:photos", endpoints: [inventory, image] };
}
