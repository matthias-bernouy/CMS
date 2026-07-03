import { HttpError } from "../core/errors.ts";
import { isRecord } from "../core/records.ts";
import { rest, restError, restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { writePayload } from "./payload.ts";
import { insertRow } from "./rows.ts";

type VariantOptionValue = {
    attributeId: string;
    optionId?: string;
    valueText?: string | null;
};

export async function syncVariantOptionValues(variantId: string | number, body: JsonRecord): Promise<void> {
    const raw = optionValuesFromBody(body);
    if (raw === undefined) return;
    const values = raw.map(readOptionValue);
    assertUniqueAttributes(values);
    await validateOptionValues(values);
    await deleteRows(`variant_attribute_values?variant_id=eq.${encodeURIComponent(String(variantId))}`);
    for (const value of values) {
        await insertRow("variant_attribute_values", {
            variant_id: variantId,
            attribute_id: value.attributeId,
            option_id: value.optionId ?? null,
            value_text: value.valueText ?? null,
        });
    }
}

function optionValuesFromBody(body: JsonRecord): unknown[] | undefined {
    const payload = writePayload(body);
    const value = payload.optionValues ?? payload.option_values ?? payload.attributeValues ?? payload.attribute_values;
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) throw new HttpError(400, "optionValues must be an array");
    return value;
}

function readOptionValue(value: unknown): VariantOptionValue {
    if (!isRecord(value)) throw new HttpError(400, "optionValues entries must be objects");
    const attributeId = text(value.attributeId ?? value.attribute_id);
    const optionId = text(value.optionId ?? value.option_id);
    const valueText = text(value.valueText ?? value.value_text);
    if (!attributeId) throw new HttpError(400, "optionValues entries require attributeId");
    if (!optionId && !valueText) throw new HttpError(400, "optionValues entries require optionId or valueText");
    return { attributeId, optionId, valueText: valueText ?? null };
}

function assertUniqueAttributes(values: VariantOptionValue[]): void {
    const seen = new Set<string>();
    for (const value of values) {
        if (seen.has(value.attributeId)) throw new HttpError(400, "optionValues cannot contain duplicate attributes");
        seen.add(value.attributeId);
    }
}

async function validateOptionValues(values: VariantOptionValue[]): Promise<void> {
    const attributeIds = values.map(value => value.attributeId);
    if (attributeIds.length) {
        const attributes = await restJson<JsonRecord[]>(
            `attributes?id=in.(${attributeIds.map(encodeURIComponent).join(",")})&select=id,data_type`,
            { method: "GET" },
        );
        const existing = new Set(attributes.map(attribute => String(attribute.id)));
        const missing = attributeIds.filter(id => !existing.has(id));
        if (missing.length) throw new HttpError(400, "optionValues contain unknown attributes");
    }
    await validateOptionIds(values);
}

async function validateOptionIds(values: VariantOptionValue[]): Promise<void> {
    const optionIds = values.map(value => value.optionId).filter((id): id is string => Boolean(id));
    if (!optionIds.length) return;
    const options = await restJson<JsonRecord[]>(
        `attribute_options?id=in.(${optionIds.map(encodeURIComponent).join(",")})&select=id,attribute_id`,
        { method: "GET" },
    );
    const byId = new Map(options.map(option => [String(option.id), String(option.attribute_id)]));
    for (const value of values) {
        if (!value.optionId) continue;
        const attributeId = byId.get(value.optionId);
        if (!attributeId) throw new HttpError(400, "optionValues contain unknown options");
        if (attributeId !== value.attributeId) throw new HttpError(400, "optionValues optionId must belong to attributeId");
    }
}

async function deleteRows(path: string): Promise<void> {
    const response = await rest(path, { method: "DELETE", headers: { prefer: "return=minimal" } });
    if (!response.ok) throw await restError(response);
}

function text(value: unknown): string | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
