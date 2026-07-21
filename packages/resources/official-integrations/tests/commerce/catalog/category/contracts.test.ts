import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { installCommerceTestEnvironment, requestCommerce } from "../../harness";
import { adminCategory, adminSourceCategory, publicCategory, publicSourceCategory, rootCategory } from "./expected";
import { rootCategoryRow, useCategoryResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce category detail contracts", () => {
    test("preserves the complete administrator response, field order, and opaque metadata", async () => {
        useCategoryResponder();

        const response = await requestCommerce("/admin/category?id=9", { userRole: null });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(adminCategory);
    });

    test("preserves the complete public response and omits administrator field loading", async () => {
        useCategoryResponder();

        const response = await requestCommerce("/category?fullSlug=sports%2Ftennis");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(publicCategory);
    });

    test("preserves root-category nulls and empty collections", async () => {
        useCategoryResponder({ category: rootCategoryRow(), parent: null, fields: [] });

        const response = await requestCommerce("/admin/category?id=3");

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual(rootCategory);
    });

    test("preserves a missing referenced parent as null without dropping administrator fields", async () => {
        useCategoryResponder({ parent: null });

        const response = await requestCommerce("/admin/category?id=9");
        const body = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(body).toEqual({ ...adminCategory, parent: null });
    });

    test("preserves the distinct strict Source projections consumed by integrations", async () => {
        const definition = JSON.parse(await readFile(definitionPath, "utf8"));
        const endpoints = definition.artifacts.find((artifact: any) => artifact.source).source.endpoints;

        expect(
            projectStrictDataShape(publicCategory, responseBody(endpoints, "category"), "response", {
                enforceRequired: false,
            }),
        ).toEqual(publicSourceCategory);
        expect(
            projectStrictDataShape(adminCategory, responseBody(endpoints, "manageCategory"), "response", {
                enforceRequired: false,
            }),
        ).toEqual(adminSourceCategory);
    });
});

const definitionPath = resolve(import.meta.dir, "../../../../integrations/commerce/versions/1.0.0/definition.json");

function responseBody(endpoints: any[], endpointId: string): DataShape {
    const body = endpoints.find((endpoint) => endpoint.endpointId === endpointId)?.output?.[0]?.body;
    if (!body) {
        throw new Error(`Missing response contract for ${endpointId}`);
    }
    return body;
}
