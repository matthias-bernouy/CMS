import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { connectorRequest, installConnectorHarness, requests } from "./harness";

installConnectorHarness();

describe("sales-configurator admin draft resources", () => {
    for (const draft of [
        {
            name: "partner",
            path: "/admin/partner?id=__new__",
            body: {
                id: null,
                cmsUserId: "",
                status: "active",
                displayName: "",
                contactEmail: null,
                capabilities: [],
            },
        },
        {
            name: "module",
            path: "/admin/module?id=__new__",
            body: {
                id: null,
                code: "",
                name: "",
                description: null,
                status: "draft",
                sortOrder: 0,
            },
        },
        {
            name: "variant",
            path: "/admin/variant?id=__new__",
            body: {
                id: null,
                code: "",
                name: "",
                description: null,
                status: "draft",
                sortOrder: 0,
                moduleItemId: null,
                moduleName: "",
                providerName: null,
                pricingMode: "fixed",
                unitAmountCents: null,
                currency: "EUR",
            },
        },
        {
            name: "feature",
            path: "/admin/feature?id=__new__",
            body: {
                id: null,
                code: "",
                name: "",
                description: null,
                status: "draft",
                sortOrder: 0,
            },
        },
    ]) {
        test(`returns an in-memory ${draft.name} draft for __new__`, async () => {
            const result = await connectorRequest(draft.path, {
                userId: "admin-a",
                userRole: "admin",
            });

            expect(result.status).toBe(200);
            expect(await result.json()).toEqual(draft.body);
            expect(requests()).toEqual([]);
        });
    }

    test("declares the __new__ selectors as strings and their ids as nullable", async () => {
        for (const contract of [
            {
                endpoint: "definitions/artifacts/sources/primary/endpoints/admin/partners/manage-partner.json",
                shape: "definitions/artifacts/sources/primary/shapes/partners/partner.json",
            },
            {
                endpoint: "definitions/artifacts/sources/primary/endpoints/admin/catalog/modules/manage-module.json",
                shape: "definitions/artifacts/sources/primary/shapes/catalog/module.json",
            },
            {
                endpoint: "definitions/artifacts/sources/primary/endpoints/admin/catalog/variants/manage-variant.json",
                shape: "definitions/artifacts/sources/primary/shapes/catalog/variant.json",
            },
            {
                endpoint: "definitions/artifacts/sources/primary/endpoints/admin/catalog/features/manage-feature.json",
                shape: "definitions/artifacts/sources/primary/shapes/catalog/feature.json",
            },
        ]) {
            const endpoint = await readDefinition<Array<{ params: Array<{ name: string; type: string }> }>>(
                contract.endpoint,
            );
            const shape = await readDefinition<{
                properties: Record<string, { nullable?: boolean }>;
            }>(contract.shape);

            expect(endpoint[0]?.params.find((param) => param.name === "id")?.type).toBe("string");
            expect(shape.properties.id?.nullable).toBe(true);
        }

        const variant = await readDefinition<{
            properties: Record<string, { nullable?: boolean }>;
        }>("definitions/artifacts/sources/primary/shapes/catalog/variant.json");
        expect(variant.properties.moduleItemId?.nullable).toBe(true);
    });
});

async function readDefinition<T>(path: string): Promise<T> {
    const root = resolve(import.meta.dir, "../../../../integrations/domains/sales-configurator/versions/1.0.0");
    return (await Bun.file(resolve(root, path)).json()) as T;
}
