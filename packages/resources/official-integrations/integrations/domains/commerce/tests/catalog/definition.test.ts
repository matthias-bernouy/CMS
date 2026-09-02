import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../../../tests/helpers/integrationDefinition";

type Field = {
    id: string;
    type: string;
    derive?: { type?: string; sourceField?: string };
    schema?: { endpoint?: string; params?: Record<string, string>; itemsPath?: string };
    exclude?: { from?: string; valuePath?: string };
};
type View = {
    widget: string;
    id: string;
    main?: Array<{ fields: Field[] }>;
    aside?: Array<{ fields: Field[] }>;
};
type Artifact = {
    type: string;
    source?: { endpoints: Array<{ endpointId: string }> };
    dashboard?: { id: string; views: View[] };
};

const definitionPath = resolve(import.meta.dir, "../../definition.json");

describe("commerce product dashboard definition", () => {
    test("keeps variants, axes, and media inside Product without tabs", async () => {
        const definition = await loadIntegrationDefinition<{ artifacts: Artifact[] }>(definitionPath);
        const source = definition.artifacts.find((artifact) => artifact.type === "source")?.source;
        const dashboards = definition.artifacts.flatMap((artifact) => (artifact.dashboard ? [artifact.dashboard] : []));
        const products = dashboards.find((dashboard) => dashboard.id === "{{answers.id}}-products");
        const views = products?.views ?? [];
        const productDetail = products?.views.find((view) => view.id === "productDetail");
        const fields = [...(productDetail?.main ?? []), ...(productDetail?.aside ?? [])].flatMap(
            (section) => section.fields,
        );

        expect(source?.endpoints.map((endpoint) => endpoint.endpointId)).not.toEqual(
            expect.arrayContaining(["variants", "variant", "upsertVariant"]),
        );
        expect(views.map((view) => view.widget)).not.toContain("w-tabs");
        expect(views.map((view) => view.id)).not.toEqual(expect.arrayContaining(["variantsTable", "variantDetail"]));
        expect(fields.find((field) => field.id === "media")).toMatchObject({ type: "media" });
        expect(fields.find((field) => field.id === "variantAxes")).toMatchObject({ type: "table" });
        const axes = fields.find((field) => field.id === "variantAxes") as any;
        expect(axes.columns.map((column: any) => column.id)).toEqual(["fieldKey", "values"]);
        expect(axes.columns[0]).toMatchObject({
            type: "combobox",
            lookup: {
                endpoint: "categoryProductFields",
                params: { categoryId: "$field.primaryCategoryId" },
                itemsPath: "fields",
                valuePath: "fieldKey",
                labelPath: "label",
            },
        });
        expect(axes.columns[0].lookup.create).toBeUndefined();
        expect(axes).toMatchObject({ addLabel: "Add axis" });
        expect(axes.columns[1]).toMatchObject({ type: "tokens" });
        expect(axes.columns[1]).not.toHaveProperty("value");
        expect(fields.find((field) => field.id === "metadata")).toMatchObject({
            type: "schema",
            exclude: { from: "$field.variantAxes", valuePath: "fieldKey" },
            schema: {
                endpoint: "categoryProductFields",
                params: { categoryId: "$field.primaryCategoryId" },
                itemsPath: "fields",
            },
        });
        expect(fields.find((field) => field.id === "variantMatrix")).toMatchObject({
            type: "table",
            derive: { type: "cartesian", sourceField: "variantAxes" },
        });
        expect(productDetail?.main.flatMap((section) => section.fields).map((field) => field.id)).not.toEqual(
            expect.arrayContaining(["brandId", "primaryCategoryId"]),
        );
        expect(
            productDetail?.aside
                ?.find((section) => (section as any).id === "productClassification")
                ?.fields.map((field) => field.id),
        ).toEqual(["brandId", "primaryCategoryId"]);
    });
});

describe("commerce taxonomy dashboard definition", () => {
    test("allows creating and moving a root category without a parent", async () => {
        const definition = await loadIntegrationDefinition<any>(definitionPath);
        const source = definition.artifacts.find((artifact: any) => artifact.type === "source").source;
        const endpoint = source.endpoints.find((candidate: any) => candidate.endpointId === "upsertCategory");
        const dashboard = definition.artifacts.find(
            (artifact: any) => artifact.dashboard?.id === "{{answers.id}}-taxonomy",
        ).dashboard;
        const detail = dashboard.views.find((view: any) => view.id === "categoryDetail");

        expect(endpoint.body.properties.parentId).toEqual({ type: "string" });
        expect(endpoint.body.required ?? []).not.toContain("parentId");
        expect(detail.main[0].fields.find((field: any) => field.id === "parentId").required).not.toBeTrue();
    });

    test("allows optional Product classification references to be empty", async () => {
        const definition = await loadIntegrationDefinition<any>(definitionPath);
        const source = definition.artifacts.find((artifact: any) => artifact.type === "source").source;
        const endpoint = source.endpoints.find((candidate: any) => candidate.endpointId === "upsertProduct");

        expect(endpoint.body.properties.brandId).toEqual({ type: "string" });
        expect(endpoint.body.properties.primaryCategoryId).toEqual({ type: "string" });
    });

    test("uses reorderable navigation lists and keeps state in detail asides", async () => {
        const definition = await loadIntegrationDefinition<any>(definitionPath);
        const taxonomy = definition.artifacts.find(
            (artifact: any) => artifact.dashboard?.id === "{{answers.id}}-taxonomy",
        ).dashboard;
        const brands = taxonomy.views.find((view: any) => view.id === "brandsTable");
        const categories = taxonomy.views.find((view: any) => view.id === "categoriesTable");
        const details = taxonomy.views.filter((view: any) => ["brandDetail", "categoryDetail"].includes(view.id));

        expect([brands.widget, categories.widget]).toEqual(["w-navigation-list", "w-navigation-list"]);
        expect(brands.reorderable).toEqual({ action: "reorderBrands" });
        expect(categories.reorderable).toEqual({ action: "reorderCategories" });
        expect(details.every((detail: any) => detail.aside[0].fields[0].id === "status")).toBeTrue();
        expect(categories.actions[1].endpoint.body).toEqual({ ids: "$value" });
        expect(
            details.find((detail: any) => detail.id === "categoryDetail").main[0].fields.map((field: any) => field.id),
        ).not.toContain("position");
    });

    test("exposes confirmed deletion actions for metadata and taxonomy details", async () => {
        const definition = await loadIntegrationDefinition<any>(definitionPath);
        const source = definition.artifacts.find((artifact: any) => artifact.type === "source").source;
        const dashboards = definition.artifacts.flatMap((artifact: any) =>
            artifact.dashboard ? [artifact.dashboard] : [],
        );
        const taxonomy = dashboards.find((dashboard: any) => dashboard.id === "{{answers.id}}-taxonomy");
        const metadata = dashboards.find((dashboard: any) => dashboard.id === "{{answers.id}}-metadata");
        const brand = taxonomy.views.find((view: any) => view.id === "brandDetail");
        const category = taxonomy.views.find((view: any) => view.id === "categoryDetail");
        const customField = metadata.views.find((view: any) => view.id === "customFieldDetail");

        expect(
            source.endpoints.filter((endpoint: any) =>
                ["deleteBrand", "deleteCategory", "deleteCustomField"].includes(endpoint.endpointId),
            ),
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    endpointId: "deleteBrand",
                    method: "DELETE",
                    effects: { invalidatesSchema: true },
                }),
                expect.objectContaining({
                    endpointId: "deleteCategory",
                    method: "DELETE",
                    effects: { invalidatesSchema: true },
                }),
                expect.objectContaining({
                    endpointId: "deleteCustomField",
                    method: "DELETE",
                    effects: { invalidatesSchema: true },
                }),
            ]),
        );
        for (const [detail, actionId] of [
            [brand, "deleteBrand"],
            [category, "deleteCategory"],
            [customField, "deleteCustomField"],
        ] as const) {
            expect(detail.actions.find((action: any) => action.id === actionId)).toMatchObject({
                tone: "danger",
                placement: "more",
                icon: "trash",
            });
        }
        expect(customField.aside[0].id).toBe("customFieldAccess");
    });

    test("lets categories select Product metadata policies", async () => {
        const definition = await loadIntegrationDefinition<any>(definitionPath);
        const source = definition.artifacts.find((artifact: any) => artifact.type === "source").source;
        const taxonomy = definition.artifacts.find(
            (artifact: any) => artifact.dashboard?.id === "{{answers.id}}-taxonomy",
        ).dashboard;
        const detail = taxonomy.views.find((view: any) => view.id === "categoryDetail");
        const field = detail.main[0].fields.find((candidate: any) => candidate.id === "categoryFields");
        const save = detail.actions.find((action: any) => action.id === "saveCategory");

        expect(source.endpoints.map((endpoint: any) => endpoint.endpointId)).toContain("categoryProductFields");
        expect(field).toMatchObject({ type: "reorderable-list", itemKey: "fieldKey", positionPath: "position" });
        expect(field.fields.map((item: any) => item.id)).toEqual(["fieldKey", "required", "filterable"]);
        expect(field.fields.filter((item: any) => ["required", "filterable"].includes(item.id))).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: "required", type: "checkbox" }),
                expect.objectContaining({ id: "filterable", type: "checkbox" }),
            ]),
        );
        expect(field.fields.find((item: any) => item.id === "fieldKey")).toMatchObject({
            type: "combobox",
            lookup: {
                endpoint: "entityCustomFields",
                params: { entityType: "product" },
                itemsPath: "items",
                valuePath: "key",
                labelPath: "label",
            },
        });
        expect(field.fields.find((item: any) => item.id === "fieldKey").lookup.create).toBeUndefined();
        expect(save.endpoint.body.categoryFields).toBe("$field.categoryFields");
    });
});
