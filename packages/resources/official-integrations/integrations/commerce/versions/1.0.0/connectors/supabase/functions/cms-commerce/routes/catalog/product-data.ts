import { camelize, isRecord } from "../../core/records.ts";
import { restJson } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";

const variantSelect = [
    "id", "product_id", "sku", "title", "status", "position", "combination_key",
    "generated_from_axes", "metadata", "version", "created_at", "updated_at",
].join(",");

export async function productData(_request: Request, product: JsonRecord): Promise<JsonRecord> {
    const productId = String(product.id);
    const [axes, values, variants, selections, media, brand, categories] = await Promise.all([
        related("product_variant_axes", productId, "id,key,field_key,label,position", "position.asc,id.asc"),
        related("product_variant_axis_values", productId, "id,axis_id,key,label,value,position", "position.asc,id.asc"),
        related("product_variants", productId, variantSelect, "position.asc,id.asc"),
        related("product_variant_selections", productId, "variant_id,axis_id,value_id"),
        related("product_media", productId, mediaSelect, "sort_order.asc,id.asc"),
        product.brand_id
            ? restJson<JsonRecord[]>(`brands?select=id,slug,name,status&id=eq.${product.brand_id}&limit=1`).then(rows => rows[0] ?? null)
            : null,
        related("product_categories", productId, categorySelect, "is_primary.desc,position.asc,category_id.asc"),
    ]);
    const currentVariants = matrixRows(axes, values, variants, selections, isRecord(product.metadata) ? product.metadata : {});
    const mediaRows = media.map(mediaRow);
    const primaryCategory = categories.find(category => category.is_primary === true) ?? null;
    return {
        ...(camelize(product) as JsonRecord),
        brand: brand ? camelize(brand) : null,
        primaryCategoryId: primaryCategory?.category_id ?? null,
        primaryCategory: primaryCategory && isRecord(primaryCategory.category)
            ? camelize(primaryCategory.category)
            : null,
        categories: categories.map(category => camelize(category)),
        media: mediaRows,
        mainImageMediaId: mainMediaId(mediaRows),
        variantAxes: axisRows(axes, values),
        variants: currentVariants,
        variantMatrix: currentVariants,
    };
}

function axisRows(axes: JsonRecord[], values: JsonRecord[]): JsonRecord[] {
    return axes.map(axis => ({
        key: axis.key,
        fieldKey: axis.field_key,
        label: axis.label,
        position: axis.position,
        values: values.filter(value => same(value.axis_id, axis.id)).map(value => value.label),
    }));
}

function matrixRows(
    axes: JsonRecord[],
    values: JsonRecord[],
    variants: JsonRecord[],
    selections: JsonRecord[],
    productMetadata: JsonRecord,
): JsonRecord[] {
    const axisById = new Map(axes.map(axis => [String(axis.id), axis]));
    const valueById = new Map(values.map(value => [String(value.id), value]));
    return variants.flatMap(variant => {
        const choices = selections.filter(row => same(row.variant_id, variant.id)).map(row => {
            const axis = axisById.get(String(row.axis_id));
            const value = valueById.get(String(row.value_id));
            return axis && value ? {
                axisKey: axis.key,
                axisLabel: axis.label,
                valueKey: value.key,
                valueLabel: value.label,
                fieldKey: axis.field_key,
                value: value.value,
                position: axis.position,
            } : null;
        }).filter(isRecord).sort((left, right) => Number(left.position) - Number(right.position));
        if (!variant.combination_key || choices.length !== axes.length) return [];
        return [{
            ...(camelize(variant) as JsonRecord),
            key: variant.combination_key,
            variantId: String(variant.id),
            options: choices.map(choice => choice.valueLabel).join(" / "),
            choices: choices.map(({ position: _position, ...choice }) => choice),
            effectiveMetadata: {
                ...productMetadata,
                ...(isRecord(variant.metadata) ? variant.metadata : {}),
                ...Object.fromEntries(choices.filter(choice => choice.fieldKey).map(choice => [String(choice.fieldKey), choice.value])),
            },
        }];
    });
}

function mediaRow(row: JsonRecord): JsonRecord {
    const media = isRecord(row.media) ? row.media : {};
    return camelize({ ...row, media: { ...media, url: "" } }) as JsonRecord;
}

function mainMediaId(rows: JsonRecord[]): string | null {
    const row = rows.find(item => item.isMain) ?? rows[0];
    return row && isRecord(row.media) ? String(row.media.id ?? "") || null : null;
}

function related(table: string, productId: string, select: string, order?: string): Promise<JsonRecord[]> {
    const params = new URLSearchParams({ product_id: `eq.${productId}`, select });
    if (order) params.set("order", order);
    return restJson<JsonRecord[]>(`${table}?${params.toString()}`);
}

function same(left: unknown, right: unknown): boolean {
    return String(left) === String(right);
}

const mediaSelect = [
    "id", "media_id", "sort_order", "is_main",
    "media(id,storage_bucket,storage_path,mime_type,file_size,original_filename,alt,created_at,updated_at)",
].join(",");

const categorySelect = [
    "product_id", "category_id", "is_primary", "position",
    "category:categories(id,parent_id,slug,full_slug,label,status,position)",
].join(",");
