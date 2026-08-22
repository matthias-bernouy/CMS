import { describe, expect, test } from "bun:test";
import {
    sourceDtoToSource,
    sourceToCanonicalDto,
    sourceToDto,
    sourceToFlatDto,
    type SourceDto,
} from "@bernouy/cms-sources";

describe("source indexing DTO conversions", () => {
    test("converts endpoint ids to runtime urns and preserves the declaration in every view", () => {
        const indexing: NonNullable<SourceDto["indexing"]> = {
            entities: [
                {
                    id: "product",
                    resolve: {
                        endpointId: "getProduct",
                        identity: { key: "slug", inputParam: "slug", outputPath: "slug" },
                    },
                    discover: {
                        endpointId: "listProducts",
                        itemsPath: "items",
                        identityPath: "slug",
                        lastModifiedPath: "updatedAt",
                        pagination: {
                            type: "offset",
                            limitParam: "limit",
                            offsetParam: "offset",
                            pageSize: 100,
                            totalPath: "total",
                        },
                    },
                    variables: {
                        name: { path: "name", type: "text" },
                        image: { path: "image.url", type: "image" },
                    },
                    defaults: {
                        titleTemplate: "{{ name }}",
                        descriptionTemplate: "Discover {{ name }}.",
                    },
                },
            ],
        };
        const dto: SourceDto = {
            id: "catalog",
            meta: { name: "Catalog" },
            endpoints: [endpoint("getProduct"), endpoint("listProducts")],
            indexing,
        };

        const source = sourceDtoToSource(dto);
        expect(source.indexing?.entities[0]?.resolve.endpointUrn).toBe("urn:catalog:getProduct");
        expect(source.indexing?.entities[0]?.discover.endpointUrn).toBe("urn:catalog:listProducts");
        expect(sourceToDto(source).indexing).toEqual(indexing);
        expect(JSON.parse(sourceToFlatDto(source).indexing!)).toEqual(indexing);
        expect(sourceToCanonicalDto(source).indexing).toEqual(indexing);
    });
});

function endpoint(endpointId: string): SourceDto["endpoints"][number] {
    return {
        endpointId,
        method: "GET",
        targetUrl: `https://api.example.test/${endpointId}`,
        params: [],
    };
}
