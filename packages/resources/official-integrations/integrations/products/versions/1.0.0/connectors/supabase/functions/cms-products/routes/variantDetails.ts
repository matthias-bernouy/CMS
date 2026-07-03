import { camelizeRecord, camelizeValue } from "../core/records.ts";
import { restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";

export const variantSelect = "id,product_id,sku,title,is_default,status,position,metadata,created_at,updated_at";

const mediaSelect = [
    "id",
    "media_id",
    "sort_order",
    "is_main",
    "media(id,cms_file_id,url,storage_bucket,storage_path,alt,mime_type,width,height,file_size,original_filename)",
].join(",");
const attributeValueSelect = "id,variant_id,attribute_id,option_id,value_text,attributes(id,code,name,data_type),attribute_options(id,value,label)";

export async function enrichVariants(variants: JsonRecord[]): Promise<JsonRecord[]> {
    const [media, attributeValues] = await variantRelations(variants);
    return variants.map(variant => variantDetail(variant, media, attributeValues));
}

export async function enrichVariant(variant: JsonRecord): Promise<JsonRecord> {
    return (await enrichVariants([variant]))[0] ?? camelizeRecord(variant);
}

export function mainMediaId(rows: JsonRecord[]): string | null {
    const main = rows.find(row => row.is_main === true) ?? rows[0];
    return main?.media_id == null ? null : String(main.media_id);
}

async function variantRelations(variants: JsonRecord[]): Promise<[JsonRecord[], JsonRecord[]]> {
    const ids = variants.map(row => row.id).filter(value => value !== undefined && value !== null).map(String);
    if (!ids.length) return [[], []];
    const idFilter = `in.(${ids.join(",")})`;
    return await Promise.all([
        restJson<JsonRecord[]>(`variant_media?variant_id=${idFilter}&select=${encodeURIComponent(mediaSelect)}&order=sort_order.asc`, { method: "GET" }),
        restJson<JsonRecord[]>(`variant_attribute_values?variant_id=${idFilter}&select=${encodeURIComponent(attributeValueSelect)}`, { method: "GET" }),
    ]);
}

function variantDetail(variant: JsonRecord, allMedia: JsonRecord[], allValues: JsonRecord[]): JsonRecord {
    const id = String(variant.id ?? "");
    const media = allMedia.filter(row => String(row.variant_id ?? "") === id);
    const values = allValues.filter(row => String(row.variant_id ?? "") === id);
    const optionValues = values.map(optionValue);
    return {
        ...camelizeRecord(variant),
        mainImageMediaId: mainMediaId(media),
        media: media.map(camelizeValue),
        attributeValues: values.map(camelizeValue),
        optionValues,
        optionsSummary: optionValues.map(value => value.label).filter(Boolean).join(" / "),
    };
}

function optionValue(row: JsonRecord): JsonRecord {
    const attribute = record(row.attributes);
    const option = record(row.attribute_options);
    return {
        attributeId: row.attribute_id == null ? null : String(row.attribute_id),
        attributeCode: label(attribute, "code", "name", String(row.attribute_id ?? "")),
        attributeName: label(attribute, "name", "code", String(row.attribute_id ?? "")),
        optionId: row.option_id == null ? null : String(row.option_id),
        value: label(option, "value", "label", String(row.value_text ?? row.option_id ?? "")),
        label: label(option, "label", "value", String(row.value_text ?? row.option_id ?? "")),
        valueText: row.value_text ?? null,
    };
}

function record(value: unknown): JsonRecord {
    return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function label(row: JsonRecord, preferred: string, fallback: string, empty: string): string {
    return String(row[preferred] || row[fallback] || empty);
}
