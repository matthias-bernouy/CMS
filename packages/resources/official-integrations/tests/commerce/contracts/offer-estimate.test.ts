import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const definitionPath = resolve(
    import.meta.dir,
    "../../../integrations/domains/commerce/versions/1.0.0/definition.json",
);

describe("commerce offer estimate contract", () => {
    test("exposes only aggregate market price fields publicly", async () => {
        const definition = JSON.parse(await readFile(definitionPath, "utf8"));
        const source = definition.artifacts.find((artifact: any) => artifact.source).source;
        const endpoint = source.endpoints.find((candidate: any) => candidate.endpointId === "offerEstimate");
        const properties = endpoint.output[0].body.properties;

        expect(endpoint).toMatchObject({ method: "GET", access: "public" });
        expect(endpoint.params).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "productId", required: true }),
                expect.objectContaining({ name: "variantId" }),
                expect.objectContaining({ name: "conditionCode" }),
            ]),
        );
        expect(Object.keys(properties).sort()).toEqual([
            "available",
            "currency",
            "estimatedMaximumAmount",
            "estimatedMinimumAmount",
            "medianAmount",
            "observedMaximumAmount",
            "observedMinimumAmount",
            "sampleSize",
            "scope",
        ]);
    });
});
