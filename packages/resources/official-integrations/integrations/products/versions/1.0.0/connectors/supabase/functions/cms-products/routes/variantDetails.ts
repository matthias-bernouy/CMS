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

export function dedupeGeneratedVariants(variants: JsonRecord[]): JsonRecord[] {
    const seen = new Set<string>();
    return variants.filter(variant => {
        const key = generatedVariantKey(variant);
        if (!key) return true;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
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
    const optionValues = values.length ? values.map(optionValue) : metadataOptionValues(variant);
    return {
        ...camelizeRecord(variant),
        mainImageMediaId: mainMediaId(media),
        media: media.map(camelizeValue),
        attributeValues: values.map(camelizeValue),
        optionValues,
        optionsSummary: optionValues.map(value => value.label).filter(Boolean).join(" / "),
    };
}

function metadataOptionValues(variant: JsonRecord): JsonRecord[] {
    const values = record(variant.metadata).optionValues;
    if (!Array.isArray(values)) return [];
    return values.flatMap(value => {
        const row = record(value);
        const label = String(row.value ?? "");
        if (!label) return [];
        return [{
            attributeId: null,
            attributeCode: String(row.axisKey ?? ""),
            attributeName: String(row.axisLabel ?? ""),
            optionId: null,
            value: label,
            label,
            valueText: label,
        }];
    });
}

function generatedVariantKey(variant: JsonRecord): string | null {
    const metadata = record(variant.metadata);
    const generated = metadata.generatedFromAxes === true
        || text(metadata.optionKey)
        || Array.isArray(metadata.optionValues)
        || Array.isArray(variant.optionValues);
    if (!generated) return null;

    const options = optionValuesKey(variant.optionValues) || optionValuesKey(metadata.optionValues);
    if (options) return `options:${options}`;
    const optionKey = text(metadata.optionKey);
    if (optionKey) return `key:${optionKey}`;
    const summary = text(variant.optionsSummary ?? variant.options_summary);
    if (summary) return `summary:${normalized(summary)}`;
    const title = text(variant.title);
    return title ? `title:${normalized(title)}` : null;
}

function optionValuesKey(value: unknown): string {
    if (!Array.isArray(value)) return "";
    return value
        .map(item => {
            const row = record(item);
            const axis = text(row.axisKey) || text(row.attributeId) || text(row.attributeCode) || text(row.attributeName) || text(row.axisLabel);
            const option = text(row.valueKey) || text(row.optionId) || text(row.value) || text(row.label) || text(row.valueText);
            return axis && option ? `${normalized(axis)}:${normalized(option)}` : "";
        })
        .filter(Boolean)
        .join("|");
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

function text(value: unknown): string {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return typeof value === "string" ? value.trim() : "";
}

function normalized(value: string): string {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function label(row: JsonRecord, preferred: string, fallback: string, empty: string): string {
    return String(row[preferred] || row[fallback] || empty);
}
