import { handleError, json, optionsResponse, withMethod } from "./core/http.ts";
import { health } from "./routes/health.ts";
import { brand, brands } from "./routes/brands.ts";
import { categories, category } from "./routes/categories.ts";
import { attributeDefaults, brandDefaults, categoryDefaults, productDefaults } from "./routes/defaults.ts";
import { product, products } from "./routes/products.ts";
import { variant, variants } from "./routes/variants.ts";
import { generateProductVariants, productVariantAxes, productVariantAxisOptions } from "./routes/variantMatrix.ts";
import { attribute, attributeOptions, attributes } from "./routes/attributes.ts";
import { mediaFile, mediaRemove, mediaReorder, mediaReplace, mediaUpload } from "./routes/media.ts";
import { deleteById, deleteProductVariantAxis } from "./routes/deletes.ts";
import { syncProductLocalVariantAxes } from "./routes/localVariantAxes.ts";
import { writeAttributeCommand } from "./writes/attributes.ts";
import { writeProductVariantAxisCommand } from "./writes/variantAxes.ts";
import { syncVariantOptionValues } from "./writes/variantOptions.ts";
import { writeCommand } from "./writes/commands.ts";
import { syncProductCategories } from "./writes/productCategories.ts";
import {
    attributeOptionSpec,
    brandSpec,
    categoryAttributeSpec,
    categorySpec,
    externalReferenceSpec,
    productAttributeValueSpec,
    productCategorySpec,
    productSpec,
    productVariantAxisOptionSpec,
    variantAttributeValueSpec,
    variantSpec,
} from "./writes/specs.ts";

const productMediaOwner = { table: "product_media", ownerKey: "product_id", ownerParam: "productId" } as const;
const variantMediaOwner = { table: "variant_media", ownerKey: "variant_id", ownerParam: "variantId" } as const;

Deno.serve(async (request) => {
    try {
        if (request.method === "OPTIONS") return optionsResponse();

        const route = routePath(request);
        if (route === "/health") return await withMethod(request, "GET", () => health(request));

        if (route === "/brands") return await withMethod(request, "GET", () => brands(request));
        if (route === "/brand/defaults") return await withMethod(request, "GET", () => brandDefaults(request));
        if (route === "/brand") {
            if (request.method === "GET") return await brand(request);
            if (request.method === "POST") return await writeCommand(request, brandSpec);
        }

        if (route === "/categories") return await withMethod(request, "GET", () => categories(request));
        if (route === "/category/defaults") return await withMethod(request, "GET", () => categoryDefaults(request));
        if (route === "/category") {
            if (request.method === "GET") return await category(request);
            if (request.method === "POST") return await writeCommand(request, categorySpec);
        }

        if (route === "/products") return await withMethod(request, "GET", () => products(request));
        if (route === "/product/defaults") return await withMethod(request, "GET", () => productDefaults(request));
        if (route === "/product") {
            if (request.method === "GET") return await product(request);
            if (request.method === "DELETE") return await deleteById(request, "products");
            if (request.method === "POST") {
                return await writeCommand(
                    request,
                    productSpec,
                    { table: "product_media", ownerKey: "product_id" },
                    [],
                    { omitPayloadKeys: ["categoryIds", "variantAxes", "variantMatrix"], afterWrite: syncProductAfterWrite },
                );
            }
        }
        if (route === "/product/image") return await mediaLinkRoute(request, productMediaOwner);
        if (route === "/product/image/replace") return await mediaReplace(request, productMediaOwner);
        if (route === "/product/images/reorder") return await mediaReorder(request, productMediaOwner);
        if (route === "/product/image-file") return await mediaFile(request);

        if (route === "/variants") return await withMethod(request, "GET", () => variants(request));
        if (route === "/variant") {
            if (request.method === "GET") return await variant(request);
            if (request.method === "POST") {
                return await writeCommand(
                    request,
                    variantSpec,
                    { table: "variant_media", ownerKey: "variant_id" },
                    ["productId"],
                    { omitPayloadKeys: ["optionValues", "attributeValues"], afterWrite: syncVariantOptionValues },
                );
            }
        }
        if (route === "/variant/image") return await mediaLinkRoute(request, variantMediaOwner);
        if (route === "/variant/image/replace") return await mediaReplace(request, variantMediaOwner);
        if (route === "/variant/images/reorder") return await mediaReorder(request, variantMediaOwner);
        if (route === "/variant/image-file") return await mediaFile(request);
        if (route === "/variant-axes") return await withMethod(request, "GET", () => productVariantAxes(request));
        if (route === "/variant-axis-options") return await withMethod(request, "GET", () => productVariantAxisOptions(request));
        if (route === "/variants/generate") return await generateProductVariants(request);

        if (route === "/attributes") return await withMethod(request, "GET", () => attributes(request));
        if (route === "/attribute/defaults") return await withMethod(request, "GET", () => attributeDefaults(request));
        if (route === "/attribute") {
            if (request.method === "GET") return await attribute(request);
            if (request.method === "POST") return await writeAttributeCommand(request);
        }

        if (route === "/attribute-options") return await withMethod(request, "GET", () => attributeOptions(request));
        if (route === "/attribute-option") return await writeCommand(request, attributeOptionSpec);
        if (route === "/category-attribute") return await writeCommand(request, categoryAttributeSpec);
        if (route === "/product-variant-axis") {
            if (request.method === "DELETE") return await deleteProductVariantAxis(request);
            return await writeProductVariantAxisCommand(request);
        }
        if (route === "/product-variant-axis-option") {
            if (request.method === "DELETE") return await deleteById(request, "product_variant_axis_options");
            return await writeCommand(request, productVariantAxisOptionSpec, undefined, ["productId"]);
        }
        if (route === "/product-attribute-value") return await writeCommand(request, productAttributeValueSpec);
        if (route === "/variant-attribute-value") return await writeCommand(request, variantAttributeValueSpec);

        if (route === "/product-category") return await writeCommand(request, productCategorySpec);
        if (route === "/external-reference") return await writeCommand(request, externalReferenceSpec);

        return json({ error: "not found" }, 404);
    } catch (error) {
        return handleError(error);
    }
});

async function syncProductAfterWrite(id: string | number, body: Record<string, unknown>): Promise<void> {
    await syncProductCategories(id, body);
    await syncProductLocalVariantAxes(id, body);
}

function routePath(request: Request): string {
    const pathname = new URL(request.url).pathname.replace(/\/+$/, "");
    const marker = "/cms-products";
    const index = pathname.indexOf(marker);
    if (index === -1) return pathname || "/";
    return pathname.slice(index + marker.length) || "/";
}

async function mediaLinkRoute(request: Request, owner: typeof productMediaOwner | typeof variantMediaOwner): Promise<Response> {
    if (request.method === "POST") return await mediaUpload(request, owner);
    if (request.method === "DELETE") return await mediaRemove(request, owner);
    return json({ error: "not found" }, 404);
}
