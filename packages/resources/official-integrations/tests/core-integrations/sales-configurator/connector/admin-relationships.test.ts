import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { connectorRequest, installConnectorHarness, requests, response, setResponder } from "./harness";

installConnectorHarness();

describe("sales-configurator admin relationship resources", () => {
    test("returns an in-memory variant-feature draft for __new__", async () => {
        const result = await connectorRequest("/admin/variant-features?id=__new__", {
            userId: "admin-a",
            userRole: "admin",
        });

        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({
            items: [],
            item: {
                id: "__new__",
                variantItemId: null,
                variantName: null,
                variant: null,
                featureItemId: null,
                featureName: null,
                feature: null,
                availability: "included",
                pricingMode: "included",
                unitAmountCents: null,
                sortOrder: 0,
            },
            total: 0,
            limit: 50,
            offset: 0,
        });
        expect(requests()).toEqual([]);
    });

    test("returns an in-memory prerequisite draft for __new__", async () => {
        const result = await connectorRequest("/admin/requirements?id=__new__", {
            userId: "admin-a",
            userRole: "admin",
        });

        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({
            items: [],
            item: {
                id: "__new__",
                subjectItemId: null,
                subjectKind: null,
                subjectCode: null,
                subjectName: null,
                subject: null,
                requiredItemId: null,
                requiredKind: null,
                requiredCode: null,
                requiredName: null,
                required: null,
                createdAt: null,
            },
            total: 0,
            limit: 50,
            offset: 0,
        });
        expect(requests()).toEqual([]);
    });

    test("resolves a selected variant-feature from its composite row key", async () => {
        setResponder((request) => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/variant_features")) {
                return response([
                    {
                        variant_item_id: 21,
                        feature_item_id: 31,
                        availability: "optional",
                        pricing_mode: "fixed",
                        unit_amount_cents: 15000,
                        sort_order: 2,
                    },
                ]);
            }
            if (url.pathname.endsWith("/catalog_items")) {
                return response([
                    { id: 21, kind: "variant", code: "DINNER", name: "Dinner" },
                    { id: 31, kind: "feature", code: "PAY", name: "Online payment" },
                ]);
            }
            return response([]);
        });

        const result = await connectorRequest("/admin/variant-features?id=21:31", {
            userId: "admin-a",
            userRole: "admin",
        });

        expect(result.status).toBe(200);
        expect((await result.json()).item).toMatchObject({
            id: "21:31",
            variantItemId: 21,
            variantName: "Dinner",
            variant: {
                id: 21,
                kind: "variant",
                code: "DINNER",
                name: "Dinner",
                lookupSubtitle: "variant · DINNER",
            },
            featureItemId: 31,
            featureName: "Online payment",
            feature: {
                id: 31,
                kind: "feature",
                code: "PAY",
                name: "Online payment",
                lookupSubtitle: "feature · PAY",
            },
        });
        const request = requests().find((candidate) => candidate.url.pathname.endsWith("/variant_features"));
        expect(request?.url.searchParams.get("variant_item_id")).toBe("eq.21");
        expect(request?.url.searchParams.get("feature_item_id")).toBe("eq.31");
    });

    test("searches every catalogue kind through one labelled lookup endpoint", async () => {
        setResponder((request) => {
            if (new URL(request.url).pathname.endsWith("/catalog_items")) {
                return response([
                    {
                        id: 11,
                        kind: "module",
                        code: "PAYMENT",
                        name: "Payment",
                        description: "Shared payment capability",
                        status: "published",
                        sort_order: 3,
                        created_at: "2026-07-25T10:00:00.000Z",
                        updated_at: "2026-07-25T10:00:00.000Z",
                    },
                    {
                        id: 31,
                        kind: "feature",
                        code: "ONLINE_PAYMENT",
                        name: "Online payment",
                        description: null,
                        status: "published",
                        sort_order: 4,
                        created_at: "2026-07-25T10:00:00.000Z",
                        updated_at: "2026-07-25T10:00:00.000Z",
                    },
                ]);
            }
            return response([]);
        });

        const result = await connectorRequest("/admin/catalog-items?q=payment&limit=30", {
            userId: "admin-a",
            userRole: "admin",
        });

        expect(result.status).toBe(200);
        expect(await result.json()).toMatchObject({
            items: [
                {
                    id: 11,
                    kind: "module",
                    code: "PAYMENT",
                    name: "Payment",
                    lookupSubtitle: "module · PAYMENT",
                },
                {
                    id: 31,
                    kind: "feature",
                    code: "ONLINE_PAYMENT",
                    name: "Online payment",
                    lookupSubtitle: "feature · ONLINE_PAYMENT",
                },
            ],
            total: 0,
            limit: 30,
            offset: 0,
        });
        const lookup = requests().find((candidate) => candidate.url.pathname.endsWith("/catalog_items"));
        expect(lookup?.url.searchParams.get("order")).toBe("kind.asc,sort_order.asc,id.asc");
        expect(lookup?.url.searchParams.get("or")).toBe(
            "(name.ilike.*payment*,code.ilike.*payment*,description.ilike.*payment*)",
        );
    });

    test("hydrates selected prerequisite labels and catalogue kinds", async () => {
        setResponder((request) => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/catalog_requirements")) {
                return response([
                    {
                        subject_item_id: 21,
                        required_item_id: 11,
                        created_at: "2026-07-25T10:00:00.000Z",
                    },
                ]);
            }
            if (url.pathname.endsWith("/catalog_items")) {
                return response([
                    { id: 21, kind: "variant", code: "DINNER", name: "Dinner" },
                    { id: 11, kind: "module", code: "PAYMENT", name: "Payment" },
                ]);
            }
            return response([]);
        });

        const result = await connectorRequest("/admin/requirements?id=21:11", {
            userId: "admin-a",
            userRole: "admin",
        });

        expect(result.status).toBe(200);
        expect((await result.json()).item).toMatchObject({
            id: "21:11",
            subjectItemId: 21,
            subjectKind: "variant",
            subject: {
                id: 21,
                name: "Dinner",
                lookupSubtitle: "variant · DINNER",
            },
            requiredItemId: 11,
            requiredKind: "module",
            required: {
                id: 11,
                name: "Payment",
                lookupSubtitle: "module · PAYMENT",
            },
        });
    });

    test("returns the stable composite id after saving a variant-feature", async () => {
        setResponder((request) => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/rpc/upsert_variant_feature")) {
                return response({
                    state: "ok",
                    variantFeature: {
                        variantItemId: 21,
                        featureItemId: 31,
                        availability: "optional",
                        pricingMode: "fixed",
                        unitAmountCents: 15000,
                        sortOrder: 2,
                    },
                });
            }
            if (url.pathname.endsWith("/catalog_items")) {
                return response([
                    { id: 21, kind: "variant", code: "DINNER", name: "Dinner" },
                    { id: 31, kind: "feature", code: "PAY", name: "Online payment" },
                ]);
            }
            return response({});
        });

        const result = await connectorRequest("/admin/variant-feature", {
            userId: "admin-a",
            userRole: "admin",
            body: {
                variantItemId: 21,
                featureItemId: 31,
                availability: "optional",
                pricingMode: "fixed",
                unitAmountCents: 15000,
                sortOrder: 2,
            },
        });

        expect(result.status).toBe(200);
        expect(await result.json()).toMatchObject({
            id: "21:31",
            variantItemId: 21,
            featureItemId: 31,
            variant: {
                id: 21,
                name: "Dinner",
                lookupSubtitle: "variant · DINNER",
            },
            feature: {
                id: 31,
                name: "Online payment",
                lookupSubtitle: "feature · PAY",
            },
        });
    });

    test("declares stable row keys and __new__ selectors for both relation dashboards", async () => {
        for (const contract of [
            {
                endpoint:
                    "definitions/artifacts/sources/primary/endpoints/admin/catalog/variant-features/manage-variant-features.json",
                table: "definitions/artifacts/dashboards/catalog/views/variant-features/table.json",
                detail: "definitions/artifacts/dashboards/catalog/views/variant-features/detail.json",
                shape: "definitions/artifacts/sources/primary/shapes/catalog/variant-feature.json",
            },
            {
                endpoint:
                    "definitions/artifacts/sources/primary/endpoints/admin/catalog/requirements/manage-requirements.json",
                table: "definitions/artifacts/dashboards/catalog/views/requirements/table.json",
                detail: "definitions/artifacts/dashboards/catalog/views/requirements/detail.json",
                shape: "definitions/artifacts/sources/primary/shapes/catalog/requirement.json",
            },
        ]) {
            const endpoint = await readDefinition<Array<{ params: Array<{ name: string; type: string }> }>>(
                contract.endpoint,
            );
            const table = await readDefinition<Array<{ rowKey: string }>>(contract.table);
            const detail = await readDefinition<Array<{ source: { params: Record<string, string> } }>>(contract.detail);
            const shape = await readDefinition<{
                properties: Record<string, { type: string }>;
                required: string[];
            }>(contract.shape);

            expect(endpoint[0]?.params.find((param) => param.name === "id")?.type).toBe("string");
            expect(table[0]?.rowKey).toBe("id");
            expect(detail[0]?.source.params).toEqual({ id: "$selection.id" });
            expect(shape.properties.id?.type).toBe("string");
            expect(shape.required).toContain("id");
        }
    });

    test("declares resource-backed comboboxes instead of numeric relationship ids", async () => {
        const requirement = await readDefinition<
            Array<{
                main: Array<{
                    fields: Array<{
                        id: string;
                        type: string;
                        lookup?: Record<string, unknown>;
                    }>;
                }>;
            }>
        >("definitions/artifacts/dashboards/catalog/views/requirements/detail.json");
        const variantFeature = await readDefinition<
            Array<{
                main: Array<{
                    fields: Array<{
                        id: string;
                        type: string;
                        lookup?: Record<string, unknown>;
                    }>;
                }>;
            }>
        >("definitions/artifacts/dashboards/catalog/views/variant-features/detail.json");
        const requirementFields = requirement[0]?.main.flatMap((section) => section.fields) ?? [];
        const variantFeatureFields = variantFeature[0]?.main.flatMap((section) => section.fields) ?? [];

        for (const [id, selected] of [
            ["subjectItemId", "$resource.subject"],
            ["requiredItemId", "$resource.required"],
        ]) {
            expect(requirementFields.find((field) => field.id === id)).toMatchObject({
                type: "combobox",
                lookup: {
                    endpoint: "manageCatalogItems",
                    itemsPath: "items",
                    valuePath: "id",
                    labelPath: "name",
                    subtitlePath: "lookupSubtitle",
                    selected,
                },
            });
        }
        expect(requirementFields.map((field) => field.id)).not.toEqual(
            expect.arrayContaining(["subjectKind", "requiredKind"]),
        );
        expect(variantFeatureFields.find((field) => field.id === "variantItemId")?.lookup).toMatchObject({
            subtitlePath: "code",
            selected: "$resource.variant",
        });
        expect(variantFeatureFields.find((field) => field.id === "featureItemId")?.lookup).toMatchObject({
            selected: "$resource.feature",
        });

        const endpoint = await readDefinition<Array<{ endpointId: string; targetUrl: string }>>(
            "definitions/artifacts/sources/primary/endpoints/admin/catalog/items/manage-catalog-items.json",
        );
        expect(endpoint[0]).toMatchObject({
            endpointId: "manageCatalogItems",
            targetUrl: expect.stringContaining("/admin/catalog-items"),
        });
    });
});

async function readDefinition<T>(path: string): Promise<T> {
    const root = resolve(import.meta.dir, "../../../../integrations/domains/sales-configurator/versions/1.0.0");
    return (await Bun.file(resolve(root, path)).json()) as T;
}
