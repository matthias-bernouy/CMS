import { readFileSync } from "node:fs";
import { Buffer, File } from "node:buffer";
import { afterAll, describe, expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import {
    importIntegration,
    type IntegrationBlocArtifact,
    type IntegrationConnectorDeployer,
    type IntegrationConnectorDeployment,
    type IntegrationDefinition,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryDashboardRepository } from "@bernouy/cms-dashboards";
import { InMemorySecretStore, secretRefToKey } from "@bernouy/cms-secrets";
import {
    handleSourceRequest,
    InMemorySourceRepository,
    validateSource,
    type SourceRepository,
} from "@bernouy/cms-sources";

type EdgeHandler = (request: Request) => Response | Promise<Response>;
type JsonRecord = Record<string, unknown>;

const sourcePrefix = "/.cms/sources/";
const functionsBaseUrl = "https://project.supabase.co/functions/v1";
const supabaseUrl = "https://project.supabase.co";
const definitionUrl = new URL("../integrations/products/versions/1.0.0/definition.json", import.meta.url);
const edgeFunctionUrl = "../integrations/products/versions/1.0.0/connectors/supabase/functions/cms-products/index.ts";

const realFetch = globalThis.fetch;
const realDeno = (globalThis as { Deno?: unknown }).Deno;
let activeEnv: Record<string, string> = {};
let activeFetch: typeof fetch = realFetch;
let edgeHandler: EdgeHandler | undefined;

(globalThis as { Deno?: { env: { get: (key: string) => string | undefined }; serve: (handler: EdgeHandler) => unknown } }).Deno = {
    env: { get: (key) => activeEnv[key] },
    serve(handler) {
        edgeHandler = handler;
        return { shutdown() { /* test stub */ } };
    },
};
globalThis.fetch = ((input, init) => activeFetch(input, init)) as typeof fetch;

afterAll(() => {
    globalThis.fetch = realFetch;
    (globalThis as { Deno?: unknown }).Deno = realDeno;
});

describe("products 1.0.0 source", () => {
    test("loads from the official integration catalog", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const list = await repo.list();
        const integration = await repo.get("products");
        const serialized = JSON.stringify(integration);

        expect(list.map(entry => entry.kind)).toContain("products");
        expect(integration?.kind).toBe("products");
        expect(integration?.version).toBe("1.0.0");
        expect(serialized).toContain("\"dataApiSchemas\":[\"products\"]");
        expect(serialized).not.toContain("upsertOffer");
        expect(serialized).not.toContain("stockQuantity");
        expect(serialized).not.toContain("vendorId");
        expect(serialized).not.toContain("orderId");
    });

    test("installs the products source and dashboard without provider credentials", async () => {
        const harness = await createHarness();
        const source = await harness.sources.getSource("urn:products");
        const dashboard = await harness.dashboards.getDashboard("products-products");
        const endpointUrns = source?.endpoints.map(endpoint => endpoint.urn) ?? [];

        expect(source).toBeTruthy();
        expect(validateSource(source!)).toEqual([]);
        expect(endpointUrns).toContain("urn:products:products");
        expect(endpointUrns).toContain("urn:products:upsertProduct");
        expect(endpointUrns).toContain("urn:products:deleteProduct");
        expect(endpointUrns).toContain("urn:products:variants");
        expect(endpointUrns).toContain("urn:products:upsertProductVariant");
        expect(endpointUrns).toContain("urn:products:categories");
        expect(endpointUrns).toContain("urn:products:brands");
        expect(endpointUrns).toContain("urn:products:productImage");
        expect(endpointUrns).toContain("urn:products:uploadProductImage");
        expect(endpointUrns).toContain("urn:products:replaceProductImage");
        expect(endpointUrns).toContain("urn:products:removeProductImage");
        expect(endpointUrns).toContain("urn:products:reorderProductImages");
        expect(endpointUrns).toContain("urn:products:variantImage");
        expect(endpointUrns).toContain("urn:products:uploadVariantImage");
        expect(endpointUrns).toContain("urn:products:replaceVariantImage");
        expect(endpointUrns).toContain("urn:products:removeVariantImage");
        expect(endpointUrns).toContain("urn:products:reorderVariantImages");
        expect(endpointUrns).toContain("urn:products:productVariantAxes");
        expect(endpointUrns).toContain("urn:products:productVariantAxisOptions");
        expect(endpointUrns).toContain("urn:products:upsertProductVariantAxisOption");
        expect(endpointUrns).toContain("urn:products:deleteProductVariantAxis");
        expect(endpointUrns).toContain("urn:products:deleteProductVariantAxisOption");
        expect(endpointUrns).toContain("urn:products:generateProductVariants");
        expect(endpointUrns).toContain("urn:products:productDefaults");
        expect(endpointUrns).toContain("urn:products:categoryDefaults");
        expect(endpointUrns).toContain("urn:products:brandDefaults");
        expect(endpointUrns).toContain("urn:products:attributeDefaults");
        expect(endpointUrns).not.toContain("urn:products:media");
        expect(endpointUrns).not.toContain("urn:products:upsertMedia");
        expect(dashboard).toBeTruthy();
        const dashboardJson = JSON.stringify(dashboard);
        expect(dashboardJson).toContain("Create product");
        expect(dashboardJson).toContain("Variants");
        expect(dashboardJson).toContain("\"type\":\"combobox\"");
        expect(dashboardJson).toContain("\"type\":\"tokens\"");
        expect(dashboardJson).toContain("\"type\":\"media\"");
        expect(dashboardJson).toContain("\"visibleWhen\":{\"field\":\"dataType\",\"equals\":\"option\"}");
        expect(dashboardJson).toContain("\"path\":\"variantAxes\"");
        expect(dashboardJson).toContain("\"path\":\"variantMatrix\"");
        expect(dashboardJson).toContain("\"productId\":\"$resource.id\"");
        expect(dashboardJson).toContain("\"categoryIds\":\"$field.categoryIds\"");
        expect(dashboardJson).not.toContain("Add option group");
        expect(dashboardJson).toContain("\"mode\":\"inline\"");
        expect(dashboardJson).not.toContain("Generate variants");
        expect(dashboardJson).toContain("Archive product");
        expect(dashboardJson).toContain("uploadProductImage");
        expect(dashboardJson).toContain("replaceProductImage");
        expect(dashboardJson).toContain("removeProductImage");
        expect(dashboardJson).toContain("reorderProductImages");
        expect(dashboardJson).toContain("\"mediaIds\":\"$media.valueIds\"");
        expect(dashboardJson).not.toContain("\"collections\"");
        expect(dashboardJson).not.toContain("\"collection\"");
        expect(dashboardJson).not.toContain("\"input\"");
        expect(dashboardJson).not.toContain("\"widget\":\"w-resource-page\"");
        expect(dashboardJson).not.toContain("\"widget\":\"w-create\"");
        expect(dashboardJson).not.toContain("\"widget\":\"w-update\"");
        expect(dashboardJson).not.toContain("\"widget\":\"w-delete\"");
        expect(dashboardJson).not.toContain("Variant setup");
        expect(dashboardJson).not.toContain("Add axis option");
        expect(dashboardJson).not.toContain("Create variant");
        expect(dashboardJson).not.toContain("Brand id");
        expect(dashboardJson).not.toContain("Parent id");
        expect(dashboardJson).not.toContain("Product id");
        expect(dashboardJson).not.toContain("Main media id");
        expect(dashboardJson).not.toContain("CMS file id");
        expect(dashboardJson).not.toContain("External URL");
        expect(dashboardJson).not.toContain("\"create\":{\"mode\":\"modal\"");
        expect(dashboardJson).toContain("\"endpoint\":\"upsertBrand\"");
        expect(dashboardJson).not.toContain("\"id\":\"categoryCreate\"");
        expect(dashboardJson).not.toContain("\"id\":\"categoriesTable\"");
        expect(dashboardJson).not.toContain("\"id\":\"categoryDetail\"");
        expect(dashboardJson).not.toContain("stockQuantity");
        const rootTabs = rootDashboardTabs(dashboard as unknown as JsonRecord);
        expect(rootTabs.map(tab => tab.label)).toEqual(["Products", "Attributes"]);
        const productsTable = widgetById(rootTabs, "productsTable");
        const productDetail = widgetById(rootTabs, "productDetail");
        expect(productsTable?.selection).toEqual({ opens: "productDetail" });
        expect(actionLabels(productsTable)).toEqual(["Create product"]);
        expect((productsTable?.actions as JsonRecord[] | undefined)?.[0]?.selection).toEqual({ opens: "productDetail" });
        expect(productDetail?.title).toEqual({ path: "title", fallback: "Product" });
        expect(productDetail?.status).toEqual({ path: "status" });
        expect(sectionTitles(productDetail, "main")).toEqual(["Details", "Media", "Variants"]);
        expect(sectionTitles(productDetail, "aside")).toEqual(["Status", "Organization"]);
        expect(sectionFieldIds(productDetail, "Details")).toEqual(["slug", "title", "description"]);
        expect(sectionFieldIds(productDetail, "Organization", "aside")).toEqual(["brandId", "categoryIds"]);
        expect(sectionFieldIds(productDetail, "Variants")).toEqual([
            "variantAxes",
            "variantMatrix",
        ]);
        expect(actionLabels(productDetail)).toEqual(["Save product", "Archive product", "Delete product"]);
        expect(widgetById(rootTabs, "categoryCreate")).toBeUndefined();
        expect(widgetById(rootTabs, "categoriesTable")).toBeUndefined();
        expect(widgetById(rootTabs, "categoryDetail")).toBeUndefined();
        expect(widgetById(rootTabs, "brandCreate")).toBeUndefined();
        expect(widgetById(rootTabs, "brandsTable")).toBeUndefined();
        expect(widgetById(rootTabs, "attributeCreate")?.source).toEqual({ endpoint: "attributeDefaults" });
        expect(harness.deployment?.dataApiSchemas).toEqual(["products"]);
        const functionSecrets = harness.deployment?.functions[0]?.secrets ?? {};
        expect(String(functionSecrets.CMS_PRODUCTS_API_KEY)).toStartWith("cms_pr_");
        expect(definition().inputs).toEqual([
            {
                name: "id",
                label: "Source id",
                type: "text",
                required: true,
                defaultValue: "products",
            },
        ]);
    });

    test("hydrates and builds the product search bloc", async () => {
        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("products");
        const artifact = definition?.artifacts?.find(artifact => artifact.type === "bloc" && artifact.bloc.tag === "product-search");
        expect(artifact?.type).toBe("bloc");
        if (artifact?.type !== "bloc") throw new Error("expected product-search bloc artifact");

        expect(artifact.bloc.viewJS).toContain("BE5_TAG_TO_BE_REPLACED");
        expect(artifact.bloc.source?.["manifest.json"]).toBeTruthy();
        expect(artifact.bloc.source?.["default.html"]).toBeTruthy();
        expect(artifact.bloc.source?.["Bloc.ts"]).toBeTruthy();

        const built = await prepare_bloc(
            new File([artifact.bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
            null,
            artifact.bloc.name,
            artifact.bloc.group ?? "",
            artifact.bloc.description ?? "",
            artifact.bloc.tag,
            artifact.bloc.source,
            decodeDefaultContent(artifact.bloc.source),
        );

        expect(built.id).toBe("product-search");
        expect(built.viewJS).toContain("product-search");
    });

    test("writes and reads catalogue data through the installed CMS source", async () => {
        const harness = await createHarness();

        const brand = await okJson(await sourceJson(harness, "upsertBrand", {
            slug: "acme",
            name: "Acme",
            status: "active",
        }));
        const category = await okJson(await sourceJson(harness, "upsertCategory", {
            slug: "books",
            title: "Books",
            status: "active",
        }));
        const secondCategory = await okJson(await sourceJson(harness, "upsertCategory", {
            slug: "stationery",
            title: "Stationery",
            status: "active",
        }));
        const productImage = await okJson(
            await sourceFile(harness, "uploadProductImage", file("notebook.webp", "WEBP-DATA", "image/webp")),
        );
        const product = await okJson(await sourceJson(harness, "upsertProduct", {
            slug: "notebook",
            title: "Notebook",
            description: "Plain notebook",
            brandId: brand.id,
            categoryIds: [category.id],
            status: "active",
            visibility: "public",
            mainImageMediaId: productImage.mediaId,
        }));
        const variantImage = await okJson(await sourceFile(harness, "uploadVariantImage", file("variant.png", "PNG-DATA", "image/png")));
        const variant = await okJson(await sourceJson(harness, "upsertProductVariant", {
            sku: "NB-001",
            title: "Notebook default",
            isDefault: true,
            status: "active",
            position: 1,
            mainImageMediaId: variantImage.mediaId,
        }, { productId: String(product.id) }));
        const secondVariantImage = await okJson(await sourceFile(
            harness,
            "uploadVariantImage",
            file("variant-alt.png", "ALT-PNG-DATA", "image/png"),
            { variantId: String(variant.id) },
        ));
        await okJson(await sourceJson(harness, "reorderVariantImages", {
            mediaIds: [secondVariantImage.mediaId, variantImage.mediaId],
        }, { variantId: String(variant.id) }));
        const replacedVariantImage = await okJson(await sourceFile(
            harness,
            "replaceVariantImage",
            file("variant-replaced.png", "REPLACED-PNG-DATA", "image/png"),
            { variantId: String(variant.id), mediaId: String(variantImage.mediaId) },
        ));
        await okJson(await sourceDelete(harness, "removeVariantImage", {
            variantId: String(variant.id),
            mediaId: String(secondVariantImage.mediaId),
        }));

        const update = await okJson(await sourceJson(harness, "upsertProduct", {
            title: "Notebook updated",
            categoryIds: [secondCategory.id],
            status: "active",
            visibility: "public",
        }, { id: String(product.id) }));
        const listing = await okJson(await sourceRequest(harness, "products", { q: "Notebook" }));
        const detail = await okJson(await sourceRequest(harness, "product", { id: String(product.id) }));
        const variantDetail = await okJson(await sourceRequest(harness, "variant", { id: String(variant.id) }));
        const variantListing = await okJson(await sourceRequest(harness, "variants", { productId: String(product.id) }));
        const productFile = await sourceRequest(harness, "productImage", { id: String(productImage.mediaId) });
        const variantFile = await sourceRequest(harness, "variantImage", { id: String(replacedVariantImage.mediaId) });

        expect(update.id).toBe(product.id);
        expect(productFile.status).toBe(200);
        expect(productFile.headers.get("content-type")).toBe("image/webp");
        expect(await productFile.text()).toBe("WEBP-DATA");
        expect(variantFile.status).toBe(200);
        expect(variantFile.headers.get("content-type")).toBe("image/png");
        expect(await variantFile.text()).toBe("REPLACED-PNG-DATA");
        expect(listing.items).toEqual([
            expect.objectContaining({
                id: Number(product.id),
                slug: "notebook",
                title: "Notebook updated",
                brandId: Number(brand.id),
                status: "active",
                visibility: "public",
            }),
        ]);
        expect(detail).toMatchObject({
            id: Number(product.id),
            slug: "notebook",
            title: "Notebook updated",
            mainImageMediaId: String(productImage.mediaId),
            brand: expect.objectContaining({
                id: Number(brand.id),
                name: "Acme",
            }),
            categoryIds: [String(secondCategory.id)],
            categoriesSummary: "Stationery",
            variants: [
                expect.objectContaining({
                    id: Number(variant.id),
                    sku: "NB-001",
                    isDefault: true,
                    mainImageMediaId: String(replacedVariantImage.mediaId),
                    media: [
                        expect.objectContaining({
                            mediaId: Number(replacedVariantImage.mediaId),
                            isMain: true,
                            media: expect.objectContaining({
                                id: Number(replacedVariantImage.mediaId),
                                mimeType: "image/png",
                                originalFilename: "variant-replaced.png",
                            }),
                        }),
                    ],
                }),
            ],
            categories: [
                expect.objectContaining({
                    categoryId: Number(secondCategory.id),
                    categories: expect.objectContaining({
                        id: Number(secondCategory.id),
                        fullSlug: "stationery",
                    }),
                }),
            ],
            media: [
                expect.objectContaining({
                    mediaId: Number(productImage.mediaId),
                    isMain: true,
                    media: expect.objectContaining({
                        id: Number(productImage.mediaId),
                        url: null,
                        storageBucket: "products-media",
                        storagePath: expect.stringMatching(/^media\/\d{4}-\d{2}-\d{2}\//),
                        mimeType: "image/webp",
                        fileSize: 9,
                        originalFilename: "notebook.webp",
                    }),
                }),
            ],
        });
        expect(variantDetail).toMatchObject({
            id: Number(variant.id),
            mainImageMediaId: String(replacedVariantImage.mediaId),
            media: [
                expect.objectContaining({
                    mediaId: Number(replacedVariantImage.mediaId),
                    isMain: true,
                    media: expect.objectContaining({
                        id: Number(replacedVariantImage.mediaId),
                        mimeType: "image/png",
                        originalFilename: "variant-replaced.png",
                    }),
                }),
            ],
        });
        expect(variantListing.items).toEqual([
            expect.objectContaining({
                id: Number(variant.id),
                mainImageMediaId: String(replacedVariantImage.mediaId),
                media: [
                    expect.objectContaining({
                        mediaId: Number(replacedVariantImage.mediaId),
                        isMain: true,
                    }),
                ],
            }),
        ]);
        expect(harness.rest.rows("variant_media")).toEqual([
            expect.objectContaining({
                variant_id: Number(variant.id),
                media_id: Number(replacedVariantImage.mediaId),
                is_main: true,
            }),
        ]);
        expect(detail).not.toHaveProperty("price");
        expect(detail).not.toHaveProperty("stock");
        expect(detail).not.toHaveProperty("vendor");
        expect(detail).not.toHaveProperty("orders");
        expect(harness.rest.rows("product_categories")).toEqual([
            expect.objectContaining({ product_id: Number(product.id), category_id: Number(secondCategory.id), position: 1 }),
        ]);
        expect(harness.rest.lastWriteHeaders()?.get("x-cms-user-id")).toBeNull();
        expect(harness.rest.checkedProfiles).toContain("products");
    });

    test("creates and reconciles attribute options through the attribute endpoint", async () => {
        const harness = await createHarness();
        const attribute = await okJson(await sourceJson(harness, "upsertAttribute", {
            code: "grip-size",
            name: "Grip size",
            dataType: "option",
            options: ["L1", "L2", "L3"],
        }));
        let detail = await okJson(await sourceRequest(harness, "attribute", { id: String(attribute.id) }));

        expect(detail.optionsSummary).toBe("L1, L2, L3");
        expect(detail.options).toEqual([
            expect.objectContaining({ value: "L1", position: 1 }),
            expect.objectContaining({ value: "L2", position: 2 }),
            expect.objectContaining({ value: "L3", position: 3 }),
        ]);

        await okJson(await sourceJson(harness, "upsertAttribute", {
            dataType: "option",
            options: ["L2", "L4"],
        }, { id: String(attribute.id) }));
        detail = await okJson(await sourceRequest(harness, "attribute", { id: String(attribute.id) }));
        expect(detail.optionsSummary).toBe("L2, L4");
        expect(harness.rest.rows("attribute_options").map(row => row.value)).toEqual(["L2", "L4"]);

        await okJson(await sourceJson(harness, "upsertAttribute", {
            dataType: "text",
        }, { id: String(attribute.id) }));
        detail = await okJson(await sourceRequest(harness, "attribute", { id: String(attribute.id) }));
        expect(detail.dataType).toBe("text");
        expect(detail.options).toEqual([]);
        expect(harness.rest.rows("attribute_options")).toEqual([]);
    });

    test("links uploaded product images when productId is provided", async () => {
        const harness = await createHarness();
        const product = await okJson(await sourceJson(harness, "upsertProduct", {
            slug: "poster",
            title: "Poster",
            status: "active",
            visibility: "public",
        }));
        const first = await okJson(await sourceFile(
            harness,
            "uploadProductImage",
            file("poster.webp", "POSTER-DATA", "image/webp"),
            { productId: String(product.id) },
        ));
        const second = await okJson(await sourceFile(
            harness,
            "uploadProductImage",
            file("poster-alt.webp", "ALT-DATA", "image/webp"),
            { productId: String(product.id) },
        ));
        await okJson(await sourceJson(harness, "reorderProductImages", {
            mediaIds: [second.mediaId, first.mediaId],
        }, { productId: String(product.id) }));
        const replacement = await okJson(await sourceFile(
            harness,
            "replaceProductImage",
            file("poster-replaced.webp", "REPLACED-DATA", "image/webp"),
            { productId: String(product.id), mediaId: String(first.mediaId) },
        ));
        await okJson(await sourceDelete(harness, "removeProductImage", {
            productId: String(product.id),
            mediaId: String(second.mediaId),
        }));
        const detail = await okJson(await sourceRequest(harness, "product", { id: String(product.id) }));

        expect(detail.media).toEqual([
            expect.objectContaining({
                mediaId: Number(replacement.mediaId),
                isMain: true,
            }),
        ]);
        expect(harness.rest.rows("product_media")).toEqual([
            expect.objectContaining({
                product_id: Number(product.id),
                media_id: Number(replacement.mediaId),
                is_main: true,
            }),
        ]);
    });

    test("keeps external reference writes idempotent", async () => {
        const harness = await createHarness();
        const first = await okJson(await sourceJson(harness, "upsertProduct", {
            externalReference: {
                provider: "import",
                externalId: "external-product-1",
            },
            data: {
                slug: "external-notebook",
                title: "External notebook",
                status: "active",
                visibility: "public",
            },
        }));
        const second = await okJson(await sourceJson(harness, "upsertProduct", {
            externalReference: {
                provider: "import",
                externalId: "external-product-1",
            },
            data: {
                title: "External notebook updated",
                status: "active",
                visibility: "public",
            },
        }));
        const detail = await okJson(await sourceRequest(harness, "product", { id: String(first.id) }));

        expect(second.id).toBe(first.id);
        expect(detail.title).toBe("External notebook updated");
        expect(harness.rest.rows("external_references")).toEqual([
            expect.objectContaining({
                provider: "import",
                entity_type: "product",
                external_id: "external-product-1",
                entity_id: Number(first.id),
            }),
        ]);
    });

    test("syncs variant option values through the variant endpoint", async () => {
        const harness = await createHarness();
        const product = await okJson(await sourceJson(harness, "upsertProduct", {
            slug: "variant-options",
            title: "Variant options",
            status: "active",
            visibility: "public",
        }));
        const grip = await okJson(await sourceJson(harness, "upsertAttribute", {
            code: "variant-grip",
            name: "Grip",
            dataType: "option",
        }));
        const weight = await okJson(await sourceJson(harness, "upsertAttribute", {
            code: "variant-weight",
            name: "Weight",
            dataType: "option",
        }));
        const l1 = await option(harness, grip.id, "L1", 1);
        const l2 = await option(harness, grip.id, "L2", 2);
        const w285 = await option(harness, weight.id, "285", 1);
        const w300 = await option(harness, weight.id, "300", 2);

        const variant = await okJson(await sourceJson(harness, "upsertProductVariant", {
            sku: "VO-001",
            title: "Variant option row",
            status: "active",
            optionValues: [
                { attributeId: grip.id, optionId: l1.id },
                { attributeId: weight.id, optionId: w285.id },
            ],
        }, { productId: String(product.id) }));
        let detail = await okJson(await sourceRequest(harness, "product", { id: String(product.id) }));

        expect(detail.variants).toEqual([
            expect.objectContaining({
                id: Number(variant.id),
                optionsSummary: "L1 / 285",
                optionValues: [
                    expect.objectContaining({ attributeName: "Grip", label: "L1" }),
                    expect.objectContaining({ attributeName: "Weight", label: "285" }),
                ],
            }),
        ]);

        await okJson(await sourceJson(harness, "upsertProductVariant", {
            optionValues: [
                { attributeId: grip.id, optionId: l2.id },
                { attributeId: weight.id, optionId: w300.id },
            ],
        }, { id: String(variant.id) }));
        detail = await okJson(await sourceRequest(harness, "product", { id: String(product.id) }));
        const variants = await okJson(await sourceRequest(harness, "variants", { productId: String(product.id) }));

        expect(detail.variants).toEqual([
            expect.objectContaining({
                id: Number(variant.id),
                optionsSummary: "L2 / 300",
                optionValues: [
                    expect.objectContaining({ attributeName: "Grip", label: "L2" }),
                    expect.objectContaining({ attributeName: "Weight", label: "300" }),
                ],
            }),
        ]);
        expect(variants.items).toEqual([
            expect.objectContaining({
                id: Number(variant.id),
                optionsSummary: "L2 / 300",
                optionValues: [
                    expect.objectContaining({ attributeName: "Grip", label: "L2" }),
                    expect.objectContaining({ attributeName: "Weight", label: "300" }),
                ],
            }),
        ]);
        expect(harness.rest.rows("variant_attribute_values")).toEqual(expect.arrayContaining([
            expect.objectContaining({ variant_id: Number(variant.id), attribute_id: Number(grip.id), option_id: Number(l2.id) }),
            expect.objectContaining({ variant_id: Number(variant.id), attribute_id: Number(weight.id), option_id: Number(w300.id) }),
        ]));
        expect(harness.rest.rows("variant_attribute_values")).toHaveLength(2);

        const invalid = await sourceJson(harness, "upsertProductVariant", {
            optionValues: [{ attributeId: grip.id, optionId: w300.id }],
        }, { id: String(variant.id) });
        const body = await jsonBody(invalid);

        expect(invalid.status).toBe(400);
        expect(body.error).toBe("optionValues optionId must belong to attributeId");
    });

    test("generates variants from product axes and selected options", async () => {
        const harness = await createHarness();
        const product = await okJson(await sourceJson(harness, "upsertProduct", {
            slug: "racket",
            title: "Racket",
            status: "active",
            visibility: "public",
        }));
        const grip = await okJson(await sourceJson(harness, "upsertAttribute", {
            code: "grip-size",
            name: "Grip size",
            dataType: "option",
        }));
        const weight = await okJson(await sourceJson(harness, "upsertAttribute", {
            code: "weight",
            name: "Weight",
            dataType: "option",
        }));
        const l1 = await option(harness, grip.id, "L1", 1);
        const l2 = await option(harness, grip.id, "L2", 2);
        const w285 = await option(harness, weight.id, "285", 1);
        const w300 = await option(harness, weight.id, "300", 2);
        const w320 = await option(harness, weight.id, "320", 3);

        await okJson(await sourceJson(harness, "upsertProductVariantAxis", {
            attributeId: grip.id,
            optionIds: [l1.id, l2.id],
            position: 1,
        }, { productId: String(product.id) }));
        await okJson(await sourceJson(harness, "upsertProductVariantAxis", {
            attributeId: weight.id,
            optionIds: [w285.id, w300.id, w320.id],
            position: 2,
        }, { productId: String(product.id) }));
        expect(harness.rest.rows("product_variant_axis_options")).toEqual(expect.arrayContaining([
            expect.objectContaining({ product_id: Number(product.id), attribute_id: Number(grip.id), option_id: Number(l1.id) }),
            expect.objectContaining({ product_id: Number(product.id), attribute_id: Number(weight.id), option_id: Number(w320.id) }),
        ]));
        const detail = await okJson(await sourceRequest(harness, "product", { id: String(product.id) }));
        expect(detail.variantOptionsSummary).toBe("Grip size: L1, L2 | Weight: 285, 300, 320");
        expect(detail.variantOptionGroups).toEqual([
            expect.objectContaining({ attributeName: "Grip size", optionsSummary: "L1, L2" }),
            expect.objectContaining({ attributeName: "Weight", optionsSummary: "285, 300, 320" }),
        ]);

        const first = await okJson(await sourceJson(harness, "generateProductVariants", {}, { productId: String(product.id) }));
        const second = await okJson(await sourceJson(harness, "generateProductVariants", {}, { productId: String(product.id) }));
        const variants = await okJson(await sourceRequest(harness, "variants", { productId: String(product.id), limit: "20" }));
        const productDetail = await okJson(await sourceRequest(harness, "product", { id: String(product.id) }));

        expect(first).toMatchObject({ ok: true, total: 6, created: 6, existing: 0 });
        expect(second).toMatchObject({ ok: true, total: 6, created: 0, existing: 6 });
        expect(variants.items).toHaveLength(6);
        expect(variants.items).toEqual(expect.arrayContaining([
            expect.objectContaining({ title: "Grip size: L1 / Weight: 285", status: "inactive" }),
            expect.objectContaining({ title: "Grip size: L2 / Weight: 320", status: "inactive" }),
        ]));
        expect(productDetail.variants).toHaveLength(6);
        expect(productDetail.variants).toEqual(expect.arrayContaining([
            expect.objectContaining({
                title: "Grip size: L1 / Weight: 285",
                optionsSummary: "L1 / 285",
                optionValues: [
                    expect.objectContaining({ attributeName: "Grip size", label: "L1" }),
                    expect.objectContaining({ attributeName: "Weight", label: "285" }),
                ],
            }),
            expect.objectContaining({
                title: "Grip size: L2 / Weight: 320",
                optionsSummary: "L2 / 320",
            }),
        ]));
        expect(harness.rest.rows("variant_attribute_values")).toHaveLength(12);

        await okJson(await sourceDelete(harness, "deleteProductVariantAxis", { id: String(harness.rest.rows("product_variant_axes")[0]!.id) }));
        expect(harness.rest.rows("product_variant_axes")).toHaveLength(1);
        expect(harness.rest.rows("product_variant_axis_options").filter(row => same(row.attribute_id, grip.id))).toHaveLength(0);
    });

    test("syncs product-local variant axes through product save", async () => {
        const harness = await createHarness();
        const product = await okJson(await sourceJson(harness, "upsertProduct", {
            slug: "local-racket",
            title: "Local racket",
            status: "active",
            visibility: "public",
        }));

        await okJson(await sourceJson(harness, "upsertProduct", {
            title: "Local racket",
            status: "active",
            visibility: "public",
            variantAxes: [
                { label: "Grip size", values: ["L1", "L2"] },
                { label: "Weight", values: ["285", "300"] },
            ],
        }, { id: String(product.id) }));

        const detail = await okJson(await sourceRequest(harness, "product", { id: String(product.id) }));
        const variants = await okJson(await sourceRequest(harness, "variants", { productId: String(product.id), limit: "20" }));

        expect(detail.variantAxes).toEqual([
            expect.objectContaining({ label: "Grip size", values: ["L1", "L2"] }),
            expect.objectContaining({ label: "Weight", values: ["285", "300"] }),
        ]);
        expect(detail.variantOptionsSummary).toBe("Grip size: L1, L2 | Weight: 285, 300");
        expect(detail.variantMatrix).toHaveLength(4);
        expect(detail.variantMatrix).toEqual(expect.arrayContaining([
            expect.objectContaining({ options: "L1 / 285", title: "Grip size: L1 / Weight: 285", status: "inactive" }),
            expect.objectContaining({ options: "L2 / 300", title: "Grip size: L2 / Weight: 300", status: "inactive" }),
        ]));
        expect(variants.items).toHaveLength(4);
        expect(variants.items).toEqual(expect.arrayContaining([
            expect.objectContaining({
                title: "Grip size: L1 / Weight: 285",
                optionsSummary: "L1 / 285",
                optionValues: [
                    expect.objectContaining({ attributeName: "Grip size", label: "L1" }),
                    expect.objectContaining({ attributeName: "Weight", label: "285" }),
                ],
            }),
        ]));
        expect(harness.rest.rows("variant_attribute_values")).toHaveLength(0);
    });

    test("uses product detail defaults for new products and keeps optional fields optional", async () => {
        const harness = await createHarness();
        const defaults = await okJson(await sourceRequest(harness, "product", { id: "__new__" }));

        const product = await okJson(await sourceJson(harness, "upsertProduct", {
            slug: "optional-product",
            title: "Optional product",
            description: "",
            brandId: "",
            categoryIds: [],
            status: "draft",
            visibility: "public",
        }));

        expect(defaults).toMatchObject({
            slug: "",
            title: "",
            description: "",
            brandId: null,
            categoryIds: [],
            variantAxes: [],
            variantMatrix: [],
        });
        expect(harness.rest.rows("products")).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: Number(product.id),
                description: null,
                brand_id: null,
            }),
        ]));
        expect(harness.rest.rows("product_categories").filter(row => same(row.product_id, product.id))).toEqual([]);
    });

    test("deletes products through the product delete endpoint", async () => {
        const harness = await createHarness();
        const product = await okJson(await sourceJson(harness, "upsertProduct", {
            slug: "delete-me",
            title: "Delete me",
            status: "active",
            visibility: "public",
        }));

        const result = await okJson(await sourceDelete(harness, "deleteProduct", { id: String(product.id) }));

        expect(result).toEqual({ ok: true, id: String(product.id) });
        expect(harness.rest.rows("products").some(row => same(row.id, product.id))).toBe(false);
    });

    test("rejects product variants without an idempotency key", async () => {
        const harness = await createHarness();
        const response = await sourceJson(harness, "upsertProductVariant", {
            productId: 1,
            title: "Variant without sku",
        });
        const body = await jsonBody(response);

        expect(response.status).toBe(400);
        expect(body.error).toBe("product variant requires id, externalReference, sku, or isDefault true");
    });
});

async function createHarness() {
    const sources = new InMemorySourceRepository();
    const secrets = new InMemorySecretStore();
    const dashboards = new InMemoryDashboardRepository();
    let deployment: IntegrationConnectorDeployment | undefined;
    const importedBlocs: IntegrationBlocArtifact[] = [];
    const deployer: IntegrationConnectorDeployer = {
        provider: "supabase",
        async deploy(next) {
            deployment = next;
            return {
                provider: "supabase",
                outputs: { functionsBaseUrl },
                resources: [
                    { type: "schema", id: "schema.sql", action: "applied" },
                    { type: "function", id: "cms-products", action: "deployed" },
                ],
            };
        },
    };

    const hydratedDefinition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT).get("products");
    if (!hydratedDefinition) throw new Error("products definition not found");
    const result = await importIntegration(
        {
            sources,
            secrets,
            dashboards,
            connectorDeployers: [deployer],
            blocs: {
                async importBloc(artifact) {
                    importedBlocs.push(artifact);
                    return { id: artifact.tag, action: "created" };
                },
            },
        },
        { kind: "products", answers: { id: "products" }, options: {} },
        [hydratedDefinition],
    );
    const functionSecrets = deployment?.functions[0]?.secrets ?? {};
    activeEnv = {
        ...Object.fromEntries(Object.entries(functionSecrets).map(([key, value]) => [key, String(value)])),
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SECRET_KEYS: JSON.stringify({ default: "supabase-secret-key", secondary: "secondary-secret-key" }),
        SUPABASE_SERVICE_ROLE_KEY: "legacy-service-role-key",
    };

    const handler = await loadEdgeHandler();
    const rest = new ProductsRestMock();
    activeFetch = async (input, init) => rest.fetch(input, init);

    return {
        result,
        sources,
        secrets,
        dashboards,
        importedBlocs,
        deployment,
        rest,
        async sourceFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
            try {
                const request = requestFromFetchInput(input, init);
        if (!request.url.startsWith(`${functionsBaseUrl}/cms-products/`)) {
                    throw new Error(`unexpected source proxy fetch: ${request.method} ${request.url}`);
                }
                return await handler(request);
            } catch (error) {
                return new Response(error instanceof Error ? error.stack ?? error.message : String(error), { status: 599 });
            }
        },
        async resolveSecret(ref: string): Promise<string | undefined> {
            const key = secretRefToKey(ref) ?? ref;
            return await secrets.get(key) ?? undefined;
        },
    };
}

class ProductsRestMock {
    checkedProfiles: string[] = [];
    storageObjects = new Map<string, { body: Uint8Array; headers: Headers }>();
    private readonly tables: Record<string, JsonRecord[]> = {
        brands: [],
        categories: [],
        products: [],
        product_variants: [],
        product_categories: [],
        attributes: [],
        attribute_options: [],
        category_attributes: [],
        product_variant_axes: [],
        product_variant_axis_options: [],
        product_attribute_values: [],
        variant_attribute_values: [],
        media: [],
        product_media: [],
        variant_media: [],
        external_references: [],
    };
    private readonly ids = new Map<string, number>();
    private lastNonGetHeaders: Headers | undefined;

    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const request = requestFromFetchInput(input, init);
        const url = new URL(request.url);
        const method = request.method.toUpperCase();

        if (url.origin !== supabaseUrl) {
            throw new Error(`unexpected fetch: ${method} ${request.url}`);
        }
        expect(request.headers.get("apikey")).toBe("supabase-secret-key");
        expect(request.headers.get("authorization")).toBe("Bearer supabase-secret-key");
        if (url.pathname.startsWith("/storage/v1/object/")) return await this.storageFetch(request, url, method);
        if (!url.pathname.startsWith("/rest/v1/")) throw new Error(`unexpected fetch: ${method} ${request.url}`);

        expect(request.headers.get("accept-profile")).toBe("products");
        this.checkedProfiles.push(request.headers.get("accept-profile") ?? "");
        if (method !== "GET" && method !== "HEAD") {
            expect(request.headers.get("content-profile")).toBe("products");
            this.lastNonGetHeaders = new Headers(request.headers);
        }

        const table = decodeURIComponent(url.pathname.slice("/rest/v1/".length));
        if (!this.tables[table]) throw new Error(`unexpected table: ${table}`);
        if (method === "GET") return jsonResponse(this.select(table, url));
        if (method === "POST") {
            const row = JSON.parse(await request.text()) as JsonRecord;
            const inserted = this.insert(table, row);
            return jsonResponse([inserted], 201);
        }
        if (method === "PATCH") {
            const patch = JSON.parse(await request.text()) as JsonRecord;
            const rows = this.applyFilters(this.tables[table]!, url).map(row => this.update(table, row, patch));
            return jsonResponse(rows);
        }
        if (method === "DELETE") {
            this.delete(table, url);
            return new Response(null, { status: 204 });
        }
        throw new Error(`unexpected method: ${method} ${request.url}`);
    }

    rows(table: string): JsonRecord[] {
        return this.tables[table]!.map(row => ({ ...row }));
    }

    lastWriteHeaders(): Headers | undefined {
        return this.lastNonGetHeaders;
    }

    private select(table: string, url: URL): JsonRecord[] {
        const rows = this.applyLimitOffset(this.applyFilters(this.tables[table]!, url), url);
        return rows.map(row => this.withNestedRows(table, row, url));
    }

    private insert(table: string, input: JsonRecord): JsonRecord {
        const row = normalizeNumericColumns(this.withDefaults(table, { ...input }));
        if (row.id === undefined || row.id === null || row.id === "") row.id = this.nextId(table);
        if (typeof row.id === "string" && /^\d+$/.test(row.id)) row.id = Number(row.id);
        const now = "2026-07-02T12:00:00.000Z";
        if (!row.created_at) row.created_at = now;
        if (tableHasUpdatedAt(table) && !row.updated_at) row.updated_at = now;
        if (table === "categories") this.setCategoryFullSlug(row);
        this.tables[table]!.push(row);
        return { ...row };
    }

    private update(table: string, row: JsonRecord, patch: JsonRecord): JsonRecord {
        Object.assign(row, normalizeNumericColumns(patch));
        if (tableHasUpdatedAt(table)) row.updated_at = "2026-07-02T12:30:00.000Z";
        if (table === "categories") this.setCategoryFullSlug(row);
        return { ...row };
    }

    private delete(table: string, url: URL): void {
        const deleted = new Set(this.applyFilters(this.tables[table]!, url).map(row => row.id));
        this.tables[table] = this.tables[table]!.filter(row => !deleted.has(row.id));
    }

    private withDefaults(table: string, row: JsonRecord): JsonRecord {
        if (table === "brands") return { status: "active", metadata: {}, ...row };
        if (table === "categories") return { parent_id: null, position: 0, status: "active", metadata: {}, ...row };
        if (table === "products") return { brand_id: null, status: "draft", visibility: "public", metadata: {}, ...row };
        if (table === "product_variants") return { sku: null, title: null, is_default: false, status: "active", position: 0, metadata: {}, ...row };
        if (table === "product_categories") return { position: 0, ...row };
        if (table === "attributes") return { description: null, data_type: "text", ...row };
        if (table === "attribute_options") return { label: null, position: 0, ...row };
        if (table === "category_attributes") return { is_filterable: true, position: 0, ...row };
        if (table === "product_variant_axes") return { position: 0, ...row };
        if (table === "product_variant_axis_options") return { position: 0, ...row };
        if (table === "media") {
            return {
                cms_file_id: null,
                url: null,
                storage_bucket: null,
                storage_path: null,
                alt: null,
                mime_type: null,
                width: null,
                height: null,
                file_size: null,
                original_filename: null,
                ...row,
            };
        }
        if (table === "product_media" || table === "variant_media") return { sort_order: 0, is_main: false, ...row };
        if (table === "external_references") return { metadata: {}, ...row };
        return row;
    }

    private applyFilters(rows: JsonRecord[], url: URL): JsonRecord[] {
        let out = rows.slice();
        for (const [key, raw] of url.searchParams.entries()) {
            if (["select", "order", "limit", "offset"].includes(key)) continue;
            if (key === "or") {
                out = out.filter(row => raw.split(",").some(expr => matchesOr(row, expr)));
                continue;
            }
            out = out.filter(row => matchesFilter(row, key, raw));
        }
        return out;
    }

    private applyLimitOffset(rows: JsonRecord[], url: URL): JsonRecord[] {
        const offset = Number(url.searchParams.get("offset") ?? "0");
        const limit = Number(url.searchParams.get("limit") ?? rows.length);
        return rows.slice(Number.isFinite(offset) ? offset : 0, (Number.isFinite(offset) ? offset : 0) + (Number.isFinite(limit) ? limit : rows.length));
    }

    private withNestedRows(table: string, row: JsonRecord, url: URL): JsonRecord {
        const select = url.searchParams.get("select") ?? "";
        if (table === "product_categories" && select.includes("categories(")) {
            return {
                ...row,
                categories: this.tables.categories.find(category => same(category.id, row.category_id)) ?? null,
            };
        }
        if ((table === "product_media" || table === "variant_media") && select.includes("media(")) {
            return {
                ...row,
                media: this.tables.media.find(media => same(media.id, row.media_id)) ?? null,
            };
        }
        if (table === "product_variant_axes" && select.includes("attributes(")) {
            return {
                ...row,
                attributes: this.tables.attributes.find(attribute => same(attribute.id, row.attribute_id)) ?? null,
            };
        }
        if (table === "product_variant_axis_options") {
            return {
                ...row,
                attributes: select.includes("attributes(")
                    ? this.tables.attributes.find(attribute => same(attribute.id, row.attribute_id)) ?? null
                    : undefined,
                attribute_options: select.includes("attribute_options(")
                    ? this.tables.attribute_options.find(option => same(option.id, row.option_id)) ?? null
                    : undefined,
            };
        }
        if ((table === "product_attribute_values" || table === "variant_attribute_values") && select.includes("attributes(")) {
            return {
                ...row,
                attributes: this.tables.attributes.find(attribute => same(attribute.id, row.attribute_id)) ?? null,
                attribute_options: this.tables.attribute_options.find(option => same(option.id, row.option_id)) ?? null,
            };
        }
        return { ...row };
    }

    private setCategoryFullSlug(row: JsonRecord): void {
        const slug = String(row.slug ?? "");
        const parent = row.parent_id
            ? this.tables.categories.find(category => same(category.id, row.parent_id))
            : null;
        row.full_slug = parent?.full_slug ? `${parent.full_slug}/${slug}` : slug;
    }

    private nextId(table: string): number {
        const next = (this.ids.get(table) ?? 0) + 1;
        this.ids.set(table, next);
        return next;
    }

    private async storageFetch(request: Request, url: URL, method: string): Promise<Response> {
        const prefix = "/storage/v1/object/products-media/";
        if (!url.pathname.startsWith(prefix)) throw new Error(`unexpected storage path: ${url.pathname}`);
        const path = decodeURIComponent(url.pathname.slice(prefix.length));
        if (method === "POST") {
            this.storageObjects.set(path, {
                body: new Uint8Array(await request.arrayBuffer()),
                headers: new Headers({
                    "content-type": request.headers.get("content-type") ?? "application/octet-stream",
                    "cache-control": request.headers.get("cache-control") ?? "",
                    etag: `"${path}"`,
                    "last-modified": "Thu, 02 Jul 2026 12:00:00 GMT",
                }),
            });
            return jsonResponse({ Key: path }, 200);
        }
        if (method === "GET") {
            const object = this.storageObjects.get(path);
            if (!object) return jsonResponse({ message: "Object not found" }, 404);
            return new Response(object.body.slice(), { status: 200, headers: object.headers });
        }
        throw new Error(`unexpected storage method: ${method}`);
    }
}

async function sourceRequest(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}products/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await handleSourceRequest(
        harness.sources,
        new Request(url),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                resolveContext: async () => ({ userID: "user-123" }),
            },
        },
    );
}

async function sourceJson(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    endpoint: string,
    body: JsonRecord,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}products/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await handleSourceRequest(
        harness.sources,
        new Request(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                resolveContext: async () => ({ userID: "user-123" }),
            },
        },
    );
}

async function sourceDelete(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    endpoint: string,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}products/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return await handleSourceRequest(
        harness.sources,
        new Request(url, { method: "DELETE" }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                resolveContext: async () => ({ userID: "user-123" }),
            },
        },
    );
}

async function sourceFile(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    endpoint: string,
    uploadedFile: File,
    params: Record<string, string> = {},
): Promise<Response> {
    const url = new URL(`http://cms.local${sourcePrefix}products/${endpoint}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const body = new FormData();
    body.append("file", uploadedFile, uploadedFile.name);
    return await handleSourceRequest(
        harness.sources,
        new Request(url, {
            method: "POST",
            body,
        }),
        {
            prefix: sourcePrefix,
            deps: {
                fetchImpl: harness.sourceFetch,
                resolveSecret: harness.resolveSecret,
                resolveContext: async () => ({ userID: "user-123" }),
            },
        },
    );
}

async function option(
    harness: {
        sources: SourceRepository;
        sourceFetch: typeof fetch;
        resolveSecret: (ref: string) => Promise<string | undefined>;
    },
    attributeId: unknown,
    value: string,
    position: number,
): Promise<JsonRecord> {
    return await okJson(await sourceJson(harness, "upsertAttributeOption", {
        attributeId,
        value,
        position,
    }));
}

async function loadEdgeHandler(): Promise<EdgeHandler> {
    if (!edgeHandler) await import(edgeFunctionUrl);
    if (!edgeHandler) throw new Error("cms-products edge handler was not registered");
    return edgeHandler;
}

function definition(): IntegrationDefinition {
    return JSON.parse(readFileSync(definitionUrl, "utf8")) as IntegrationDefinition;
}

function decodeDefaultContent(source: Record<string, string> | undefined): string | undefined {
    if (!source) return undefined;
    const manifestRaw = source["manifest.json"];
    if (!manifestRaw) return undefined;
    const manifest = JSON.parse(Buffer.from(manifestRaw, "base64").toString("utf-8")) as { defaultContent?: string };
    if (!manifest.defaultContent) return undefined;
    const path = manifest.defaultContent.replace(/^\.\//, "");
    const encoded = source[path];
    return encoded ? Buffer.from(encoded, "base64").toString("utf-8") : undefined;
}

function rootDashboardTabs(dashboard: JsonRecord): Array<{ label: string; children: JsonRecord[] }> {
    const tabs = (dashboard.views as JsonRecord[]).find(view => view.widget === "w-tabs")?.tabs;
    if (!Array.isArray(tabs)) return [];
    return tabs as Array<{ label: string; children: JsonRecord[] }>;
}

function widgetById(rootTabs: Array<{ children: JsonRecord[] }>, id: string): JsonRecord | undefined {
    const stack = rootTabs.flatMap(tab => tab.children);
    while (stack.length) {
        const next = stack.shift()!;
        if (next.id === id) return next;
        if (Array.isArray(next.children)) stack.push(...next.children as JsonRecord[]);
        if (Array.isArray(next.tabs)) {
            for (const tab of next.tabs as Array<{ children?: JsonRecord[] }>) {
                if (Array.isArray(tab.children)) stack.push(...tab.children);
            }
        }
    }
    return undefined;
}

function sectionTitles(widget: JsonRecord | undefined, area: "main" | "aside"): string[] {
    const sections = widget?.[area];
    if (!Array.isArray(sections)) return [];
    return sections.flatMap(section => typeof section.title === "string" ? [section.title] : []);
}

function sectionFieldIds(widget: JsonRecord | undefined, sectionTitle: string, area: "main" | "aside" = "main"): string[] {
    const sections = widget?.[area];
    if (!Array.isArray(sections)) return [];
    const fields = sections.find(section => section.title === sectionTitle)?.fields;
    if (!Array.isArray(fields)) return [];
    return fields.flatMap(field => typeof field.id === "string" ? [field.id] : []);
}

function actionLabels(widget: JsonRecord | undefined): string[] {
    const actions = widget?.actions;
    if (!Array.isArray(actions)) return [];
    return actions.flatMap(action => typeof action.label === "string" ? [action.label] : []);
}

function requestFromFetchInput(input: RequestInfo | URL, init?: RequestInit): Request {
    if (input instanceof Request && !init) return input;
    return new Request(input instanceof Request ? input.url : String(input), {
        method: init?.method ?? (input instanceof Request ? input.method : undefined),
        headers: init?.headers ?? (input instanceof Request ? input.headers : undefined),
        body: init?.body ?? (input instanceof Request ? input.body : undefined),
        redirect: init?.redirect,
    });
}

async function okJson(response: Response): Promise<JsonRecord> {
    const body = await jsonBody(response);
    if (response.status < 200 || response.status >= 300) {
        throw new Error(`expected 2xx response, got ${response.status}: ${JSON.stringify(body)}`);
    }
    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    return body;
}

async function jsonBody(response: Response): Promise<JsonRecord> {
    const text = await response.text();
    try {
        return JSON.parse(text) as JsonRecord;
    } catch {
        throw new Error(`expected JSON response, got ${response.status}: ${text}`);
    }
}

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
    });
}

function matchesFilter(row: JsonRecord, column: string, expression: string): boolean {
    if (expression === "is.null") return row[column] === null || row[column] === undefined;
    if (expression.startsWith("eq.")) return same(row[column], expression.slice("eq.".length));
    if (expression.startsWith("in.(") && expression.endsWith(")")) {
        const values = expression.slice("in.(".length, -1).split(",");
        return values.some(value => same(row[column], value));
    }
    if (expression.startsWith("ilike.*") && expression.endsWith("*")) {
        const needle = expression.slice("ilike.*".length, -1).toLowerCase();
        return String(row[column] ?? "").toLowerCase().includes(needle);
    }
    return true;
}

function matchesOr(row: JsonRecord, expression: string): boolean {
    const [column, operator, raw] = expression.split(".");
    if (!column || operator !== "ilike") return false;
    const needle = raw?.replace(/^\*/, "").replace(/\*$/, "").toLowerCase() ?? "";
    return String(row[column] ?? "").toLowerCase().includes(needle);
}

function same(left: unknown, right: unknown): boolean {
    return String(left) === String(right);
}

function tableHasUpdatedAt(table: string): boolean {
    return [
        "brands",
        "categories",
        "products",
        "product_variants",
        "attributes",
        "product_attribute_values",
        "variant_attribute_values",
        "media",
    ].includes(table);
}

function normalizeNumericColumns(row: JsonRecord): JsonRecord {
    const numericColumns = new Set([
        "id",
        "parent_id",
        "brand_id",
        "product_id",
        "category_id",
        "attribute_id",
        "option_id",
        "variant_id",
        "media_id",
        "entity_id",
        "position",
        "sort_order",
        "width",
        "height",
        "file_size",
    ]);
    const next = { ...row };
    for (const key of numericColumns) {
        const value = next[key];
        if (typeof value === "string" && /^\d+$/.test(value)) next[key] = Number(value);
    }
    return next;
}

function file(name: string, content: string, type: string): File {
    return new File([content], name, { type });
}
