import { camelizeRecord, camelizeValue } from "../core/records.ts";
import { getOne, restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { enrichVariants, mainMediaId, variantSelect } from "./variantDetails.ts";
import {
    localVariantAxesFromProduct,
    variantMatrixRows,
    variantOptionGroupsFromAxes,
    variantOptionsSummaryFromAxes,
} from "./localVariantAxes.ts";

const productMediaSelect = [
    "id",
    "media_id",
    "sort_order",
    "is_main",
    "media(id,cms_file_id,url,storage_bucket,storage_path,alt,mime_type,width,height,file_size,original_filename)",
].join(",");

export async function productDetail(row: JsonRecord): Promise<JsonRecord> {
    const productId = row.id;
    const [brand, variants, categories, media, variantAxes, variantAxisOptions, attributeValues] = await Promise.all([
        row.brand_id ? getOne("brands", { id: row.brand_id }, "id,slug,name") : Promise.resolve(null),
        related("product_variants", productId, variantSelect, "position.asc"),
        related("product_categories", productId, "id,category_id,position,categories(id,parent_id,slug,full_slug,title,status)", "position.asc"),
        related("product_media", productId, productMediaSelect, "sort_order.asc"),
        related("product_variant_axes", productId, "id,product_id,attribute_id,position,attributes(id,code,name,data_type)", "position.asc"),
        related("product_variant_axis_options", productId, "id,product_id,attribute_id,option_id,position,attribute_options(id,attribute_id,value,label,position)", "position.asc"),
        related("product_attribute_values", productId, "id,product_id,attribute_id,option_id,value_text,attributes(id,code,name,data_type),attribute_options(id,value,label)"),
    ]);
    const localAxes = localVariantAxesFromProduct(row);
    const variantOptionGroups = localAxes.length
        ? variantOptionGroupsFromAxes(localAxes)
        : buildVariantOptionGroups(variantAxes, variantAxisOptions);
    const enrichedVariants = await enrichVariants(variants);

    return {
        ...camelizeRecord(row),
        brand: brand ? camelizeRecord(brand) : null,
        mainImageMediaId: mainMediaId(media),
        categoryIds: categories.map(row => String(row.category_id ?? "")).filter(Boolean),
        categoriesSummary: categoriesSummary(categories),
        variants: enrichedVariants,
        variantsSummary: variantsSummary(enrichedVariants),
        categories: categories.map(camelizeValue),
        media: media.map(camelizeValue),
        variantAxes: localAxes.length
            ? localAxes.map(axis => ({ label: axis.label, values: axis.values, position: axis.position }))
            : variantAxes.map(axis => camelizeValue(withAxisOptionsSummary(axis, variantAxisOptions))),
        variantMatrix: variantMatrixRows(localAxes, variants),
        variantOptionGroups,
        variantOptionsSummary: localAxes.length ? variantOptionsSummaryFromAxes(localAxes) : variantOptionsSummary(variantOptionGroups),
        attributeValues: attributeValues.map(camelizeValue),
    };
}

function related(table: string, productId: unknown, select: string, order?: string): Promise<JsonRecord[]> {
    const query = `product_id=eq.${encodeURIComponent(String(productId))}&select=${encodeURIComponent(select)}`;
    return restJson<JsonRecord[]>(`${table}?${query}${order ? `&order=${order}` : ""}`, { method: "GET" });
}

function withAxisOptionsSummary(axis: JsonRecord, options: JsonRecord[]): JsonRecord {
    const attributeId = String(axis.attribute_id ?? "");
    const labels = options
        .filter(option => String(option.attribute_id ?? "") === attributeId)
        .map(option => label(record(option.attribute_options), "label", "value", String(option.option_id)))
        .filter(Boolean);
    return { ...axis, option_count: labels.length, options_summary: labels.join(", ") };
}

function buildVariantOptionGroups(axes: JsonRecord[], options: JsonRecord[]): JsonRecord[] {
    return axes.map(axis => {
        const attributeId = String(axis.attribute_id ?? "");
        const attribute = record(axis.attributes);
        const selectedOptions = options.filter(option => String(option.attribute_id ?? "") === attributeId).map(option => {
            const optionRow = record(option.attribute_options);
            return {
                id: option.option_id == null ? null : String(option.option_id),
                value: label(optionRow, "value", "label", String(option.option_id ?? "")),
                label: label(optionRow, "label", "value", String(option.option_id ?? "")),
                position: option.position ?? 0,
            };
        });
        return {
            attributeId,
            attributeCode: label(attribute, "code", "name", attributeId),
            attributeName: label(attribute, "name", "code", attributeId),
            position: axis.position ?? 0,
            options: selectedOptions,
            optionsSummary: selectedOptions.map(option => option.label).filter(Boolean).join(", "),
        };
    });
}

function variantOptionsSummary(groups: JsonRecord[]): string {
    return groups.map(group => `${group.attributeName ?? group.attributeCode}: ${group.optionsSummary}`).filter(value => !value.endsWith(": ")).join(" | ");
}

function categoriesSummary(rows: JsonRecord[]): string {
    return rows.map(row => label(record(row.categories), "title", "full_slug", String(row.category_id ?? ""))).filter(Boolean).join(", ");
}

function variantsSummary(rows: JsonRecord[]): string {
    return rows.map(row => label(row, "title", "sku", String(row.id ?? ""))).filter(Boolean).join(", ");
}

function record(value: unknown): JsonRecord {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function label(row: JsonRecord, preferred: string, fallback: string, empty: string): string {
    return String(row[preferred] || row[fallback] || empty);
}
