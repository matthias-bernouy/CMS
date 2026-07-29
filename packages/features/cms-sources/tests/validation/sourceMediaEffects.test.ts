import { describe, expect, test } from "bun:test";
import { resolveSourceMediaEffects, validateSource, type Source, type SourceEndpoint } from "@bernouy/cms-sources";

describe("source media effects", () => {
    test("validates and resolves UUID media identities from a successful upload response", async () => {
        const candidate = fixture();
        expect(validateSource(candidate)).toEqual([]);

        const resolved = await resolveSourceMediaEffects(
            candidate.endpoints[0]!,
            Response.json({ id: "550e8400-e29b-41d4-a716-446655440000", revision: "sha256:abc", width: 4500 }),
        );

        expect(resolved).toEqual([
            {
                action: "produce",
                sourceId: "photos",
                targetEndpoint: "publicPhoto",
                params: { id: "550e8400-e29b-41d4-a716-446655440000" },
                revision: "sha256:abc",
                width: 4500,
                preset: "responsive-webp-v1",
            },
        ]);
    });

    test("rejects missing targets, undeclared params and non-image targets", () => {
        const candidate = fixture();
        candidate.endpoints[0]!.effects!.producesMedia![0]!.targetEndpoint = "missing";
        expect(validateSource(candidate)).toContain(
            'invalid producesMedia.0 for "urn:photos:upload": unknown target endpoint "missing"',
        );

        const invalidTarget = fixture();
        invalidTarget.endpoints[1]!.responseKind = "json";
        expect(validateSource(invalidTarget).some((error) => error.includes("public GET file/image"))).toBe(true);
    });

    test("resolves array item bindings and ignores invalid payload items", async () => {
        const candidate = fixture();
        candidate.endpoints[0]!.effects!.producesMedia![0]!.itemsPath = "photos";
        const resolved = await resolveSourceMediaEffects(
            candidate.endpoints[0]!,
            Response.json({
                photos: [
                    { id: "one", revision: "r1", width: 1200 },
                    { id: "", revision: "r2", width: 800 },
                ],
            }),
        );
        expect(resolved).toHaveLength(1);
        expect(resolved[0]?.params).toEqual({ id: "one" });
    });

    test("resolves removed media from a declared mutation request parameter", async () => {
        const candidate = fixture();
        candidate.endpoints[0]!.input = {
            params: [{ name: "previousId", in: "query", required: true, schema: { type: "string" } }],
        };
        candidate.endpoints[0]!.effects = {
            removesMedia: [
                {
                    version: 1,
                    kind: "image",
                    targetEndpoint: "publicPhoto",
                    params: { id: { requestParam: "previousId" } },
                },
            ],
        };
        expect(validateSource(candidate)).toEqual([]);

        const resolved = await resolveSourceMediaEffects(
            candidate.endpoints[0]!,
            Response.json({ removed: true }),
            new Request("https://cms.test/.cms/sources/photos/upload?previousId=old-photo"),
        );

        expect(resolved).toEqual([
            {
                action: "remove",
                sourceId: "photos",
                targetEndpoint: "publicPhoto",
                params: { id: "old-photo" },
            },
        ]);
    });
});

function fixture(): Source {
    const upload: SourceEndpoint = {
        urn: "urn:photos:upload",
        method: "POST",
        targetUrl: "https://api.example.test/photos",
        access: { mode: "admin" },
        effects: {
            producesMedia: [
                {
                    version: 1,
                    kind: "image",
                    targetEndpoint: "publicPhoto",
                    params: { id: { responsePath: "id" } },
                    revision: { responsePath: "revision" },
                    width: { responsePath: "width" },
                    preset: "responsive-webp-v1",
                },
            ],
        },
        output: [
            {
                status: "200",
                body: {
                    type: "object",
                    properties: {
                        id: { type: "string" },
                        revision: { type: "string" },
                        width: { type: "number" },
                    },
                    required: ["id", "revision", "width"],
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
        input: {
            params: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        },
        output: [{ status: "200" }],
    };
    return { urn: "urn:photos", endpoints: [upload, image] };
}
