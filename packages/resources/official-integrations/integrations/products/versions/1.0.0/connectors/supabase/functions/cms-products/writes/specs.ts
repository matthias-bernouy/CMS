import { HttpError } from "../core/errors.ts";
import { keyFrom } from "../core/records.ts";
import type { JsonRecord, WriteSpec } from "../core/types.ts";

export const brandSpec: WriteSpec = {
    table: "brands",
    entityType: "brand",
    naturalKey: row => keyFrom(row, ["slug"]),
};

export const categorySpec: WriteSpec = {
    table: "categories",
    entityType: "category",
    naturalKey: row => row.slug ? { parent_id: row.parent_id ?? null, slug: row.slug } : null,
};

export const productSpec: WriteSpec = {
    table: "products",
    entityType: "product",
    naturalKey: row => keyFrom(row, ["slug"]),
};

export const variantSpec: WriteSpec = {
    table: "product_variants",
    entityType: "variant",
    naturalKey: row => {
        if (row.id) return { id: row.id };
        if (row.product_id && row.sku) return { product_id: row.product_id, sku: row.sku };
        if (row.product_id && row.is_default === true) return { product_id: row.product_id, is_default: true };
        throw new HttpError(400, "product variant requires id, externalReference, sku, or isDefault true");
    },
};

export const attributeSpec: WriteSpec = {
    table: "attributes",
    entityType: "attribute",
    naturalKey: row => keyFrom(row, ["code"]),
};

export const attributeOptionSpec: WriteSpec = keyed("attribute_options", "attribute_option", ["attribute_id", "value"]);
export const categoryAttributeSpec = keyed("category_attributes", "category_attribute", ["category_id", "attribute_id"]);
export const productVariantAxisSpec = keyed("product_variant_axes", "product_variant_axis", ["product_id", "attribute_id"]);
export const productVariantAxisOptionSpec = keyed("product_variant_axis_options", "product_variant_axis_option", ["product_id", "attribute_id", "option_id"]);
export const productAttributeValueSpec = keyed("product_attribute_values", "product_attribute_value", ["product_id", "attribute_id"]);
export const variantAttributeValueSpec = keyed("variant_attribute_values", "variant_attribute_value", ["variant_id", "attribute_id"]);
export const productCategorySpec = keyed("product_categories", "product_category", ["product_id", "category_id"]);
export const externalReferenceSpec = keyed("external_references", "external_reference", ["provider", "entity_type", "external_id"]);

function keyed(table: string, entityType: string, keys: string[]): WriteSpec {
    return {
        table,
        entityType,
        naturalKey: (row: JsonRecord) => keyFrom(row, keys),
    };
}
