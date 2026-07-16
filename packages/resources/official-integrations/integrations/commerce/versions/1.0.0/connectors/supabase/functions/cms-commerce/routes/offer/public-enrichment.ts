import { isRecord, publicMetadata } from "../../core/records.ts";
import { restJson } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";

export async function enrichPublicOffers(offers: JsonRecord[]): Promise<JsonRecord[]> {
    if (!offers.length) return [];
    const [offerKeys, productKeys, products, variants, mediaRows] = await Promise.all([
        publicMetadataKeys("offer"),
        publicMetadataKeys("product"),
        relatedRows("products", uniqueIds(offers, "product_id"), "id,slug,title,brand_id,status,visibility,metadata"),
        relatedRows("product_variants", uniqueIds(offers, "variant_id"), "id,product_id,sku,title,status,metadata"),
        relatedRows(
            "offer_media",
            uniqueIds(offers, "id"),
            "id,offer_id,media_id,sort_order,is_main,media(id,storage_bucket,storage_path,mime_type,file_size,original_filename,alt,created_at,updated_at)",
            "offer_id",
            "sort_order.asc,id.asc",
        ),
    ]);
    const [brands, categories, axes, axisValues, selections] = await Promise.all([
        relatedRows("brands", uniqueIds(products, "brand_id"), "id,slug,name,status"),
        relatedRows(
            "product_categories",
            uniqueIds(products, "id"),
            "product_id,category_id,is_primary,position,category:categories(id,parent_id,slug,full_slug,label,status,position)",
            "product_id",
            "is_primary.desc,position.asc,category_id.asc",
        ),
        relatedRows("product_variant_axes", uniqueIds(products, "id"), "id,product_id,field_key", "product_id"),
        relatedRows("product_variant_axis_values", uniqueIds(products, "id"), "id,product_id,axis_id,value", "product_id"),
        relatedRows("product_variant_selections", uniqueIds(variants, "id"), "product_id,variant_id,axis_id,value_id", "variant_id"),
    ]);
    const brandById = rowsById(brands);
    const categoryByProductId = new Map(categories.filter(row => row.is_primary === true).map(row => [String(row.product_id), row]));
    const productById = rowsById(products.map(product => {
        const category = categoryByProductId.get(String(product.id));
        return {
        ...product,
        metadata: publicMetadata(product.metadata, productKeys),
        brand: product.brand_id ? brandById.get(String(product.brand_id)) ?? null : null,
        primary_category_id: category ? Number(category.category_id) : null,
        primary_category: category && isRecord(category.category) ? category.category : null,
    };
    }));
    const variantById = rowsById(variants);
    const axisById = rowsById(axes);
    const axisValueById = rowsById(axisValues);
    const mediaByOffer = groupMedia(mediaRows);

    return offers.map(offer => {
        const publicOffer = Object.fromEntries(Object.entries(offer).filter(([key]) => !["seller_id", "seller"].includes(key)));
        const media = mediaByOffer.get(String(offer.id)) ?? [];
        const main = media.find(item => item.is_main === true) ?? media[0];
        const product = productById.get(String(offer.product_id)) ?? null;
        const variant = offer.variant_id ? variantById.get(String(offer.variant_id)) ?? null : null;
        const effectiveMetadata = effectiveProductMetadata(product, variant, selections, axisById, axisValueById, productKeys);
        return {
            ...publicOffer,
            metadata: publicMetadata(offer.metadata, offerKeys),
            product: product ? { ...product, metadata: effectiveMetadata, effective_metadata: effectiveMetadata } : null,
            variant: variant ? { ...variant, metadata: publicMetadata(variant.metadata, productKeys), effective_metadata: effectiveMetadata } : null,
            media,
            main_image_media_id: main && isRecord(main.media) ? String(main.media.id ?? "") || null : null,
        };
    });
}

function effectiveProductMetadata(
    product: JsonRecord | null,
    variant: JsonRecord | null,
    selections: JsonRecord[],
    axisById: Map<string, JsonRecord>,
    valueById: Map<string, JsonRecord>,
    publicKeys: Set<string>,
): JsonRecord {
    const selected = variant ? selections.filter(row => String(row.variant_id) === String(variant.id)) : [];
    const axisMetadata = Object.fromEntries(selected.flatMap(selection => {
        const axis = axisById.get(String(selection.axis_id));
        const value = valueById.get(String(selection.value_id));
        const key = String(axis?.field_key ?? "");
        return key && value && publicKeys.has(key) ? [[key, value.value]] : [];
    }));
    return {
        ...(isRecord(product?.metadata) ? product.metadata : {}),
        ...publicMetadata(variant?.metadata, publicKeys),
        ...axisMetadata,
    };
}

function groupMedia(rows: JsonRecord[]): Map<string, JsonRecord[]> {
    const grouped = new Map<string, JsonRecord[]>();
    for (const row of rows) {
        const offerId = String(row.offer_id);
        const current = grouped.get(offerId) ?? [];
        const item = isRecord(row.media) ? row.media : {};
        current.push({ ...row, media: { ...item, url: "" } });
        grouped.set(offerId, current);
    }
    return grouped;
}

async function publicMetadataKeys(entityType: string): Promise<Set<string>> {
    const rows = await restJson<JsonRecord[]>(
        `custom_field_definitions?select=key&entity_type=eq.${entityType}&public_readable=eq.true&enabled=eq.true`,
    );
    return new Set(rows.map(row => String(row.key)));
}

async function relatedRows(
    table: string,
    ids: string[],
    select: string,
    idColumn = "id",
    order?: string,
): Promise<JsonRecord[]> {
    if (!ids.length) return [];
    const params = new URLSearchParams({ select, [idColumn]: `in.(${ids.join(",")})` });
    if (order) params.set("order", order);
    return await restJson<JsonRecord[]>(`${table}?${params.toString()}`);
}

function uniqueIds(rows: JsonRecord[], key: string): string[] {
    return [...new Set(rows.map(row => row[key]).filter(value => value !== null && value !== undefined).map(String))];
}

function rowsById(rows: JsonRecord[]): Map<string, JsonRecord> {
    return new Map(rows.map(row => [String(row.id), row]));
}
