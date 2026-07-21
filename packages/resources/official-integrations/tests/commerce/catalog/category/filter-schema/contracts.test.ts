import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installCommerceTestEnvironment, requestCommerce } from "../../../harness";
import { emptyFilterSchema, emptyFilterSchemaResponse, filterSchemaResponse } from "./expected";
import { useFilterSchemaResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce offer filter schema contracts", () => {
    test("preserves category, inherited field semantics, field order, and brand order", async () => {
        useFilterSchemaResponder();

        const response = await requestCommerce("/offer-filter-schema?category=sports%2Ftennis");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(filterSchemaResponse);
    });

    test("preserves empty fields and brands with a nullable parent", async () => {
        useFilterSchemaResponder({ schema: emptyFilterSchema, brandRows: [] });

        const response = await requestCommerce("/offer-filter-schema?category=sports");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(emptyFilterSchemaResponse);
    });

    test("preserves the strict Source projection consumed by integrations", async () => {
        const endpoints = await sourceEndpoints();

        expect(
            projectStrictDataShape(filterSchemaResponse, responseBody(endpoints, "offerFilterSchema"), "response", {
                enforceRequired: false,
            }),
        ).toEqual(filterSchemaResponse);
    });

    test("keeps the Source endpoint publicly readable through GET", async () => {
        const endpoint = (await sourceEndpoints()).find((candidate) => candidate.endpointId === "offerFilterSchema");

        expect(endpoint).toMatchObject({ method: "GET", access: "public" });
    });
});

const definitionPath = resolve(import.meta.dir, "../../../../../integrations/commerce/versions/1.0.0/definition.json");

async function sourceEndpoints(): Promise<any[]> {
    const definition = JSON.parse(await readFile(definitionPath, "utf8"));
    return definition.artifacts.find((artifact: any) => artifact.source).source.endpoints;
}

function responseBody(endpoints: any[], endpointId: string): DataShape {
    const body = endpoints.find((endpoint) => endpoint.endpointId === endpointId)?.output?.[0]?.body;
    if (!body) {
        throw new Error(`Missing response contract for ${endpointId}`);
    }
    return body;
}
