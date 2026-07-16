import { HttpError } from "./errors.ts";
import { isRecord, publicMetadata } from "./records.ts";
import { restJson } from "./rest.ts";
import type { JsonRecord } from "./types.ts";

const metadataTypes = new Set(["string", "number", "boolean", "enum"]);

export type PublicOrderMetadataDefinition = {
    key: string;
    label: string;
    type: string;
    unit?: string;
};

export async function publicOrderMetadataDefinitions(): Promise<PublicOrderMetadataDefinition[]> {
    const rows = await restJson<JsonRecord[]>(
        "custom_field_definitions?select=key,label,field_type,unit&entity_type=eq.order&public_readable=eq.true&enabled=eq.true&order=position.asc,key.asc",
    );
    return rows.flatMap(row => {
        const key = stringValue(row.key);
        const type = stringValue(row.field_type);
        if (!key || !type || !metadataTypes.has(type)) return [];
        const unit = stringValue(row.unit);
        return [{
            key,
            label: stringValue(row.label) || key,
            type,
            ...(unit ? { unit } : {}),
        }];
    });
}

export function withPublicOrderMetadata(
    row: JsonRecord,
    definitions: readonly PublicOrderMetadataDefinition[],
): JsonRecord {
    const metadata = publicMetadata(row.metadata, new Set(definitions.map(definition => definition.key)));
    const metadataEntries = definitions.flatMap(definition => {
        if (!Object.hasOwn(metadata, definition.key)) return [];
        const value = displayValue(metadata[definition.key]);
        if (value === undefined) return [];
        return [{
            key: definition.key,
            label: definition.label,
            type: definition.type,
            value,
            ...(definition.unit ? { unit: definition.unit } : {}),
        }];
    });
    return { ...row, metadata, metadataEntries };
}

export function withPublicOrderResult(
    value: unknown,
    definitions: readonly PublicOrderMetadataDefinition[],
): unknown {
    if (!isRecord(value)) throw new HttpError(502, "invalid order response");
    return withPublicOrderMetadata(value, definitions);
}

export function withPublicCheckoutMetadata(
    value: unknown,
    definitions: readonly PublicOrderMetadataDefinition[],
): unknown {
    if (!isRecord(value) || !Array.isArray(value.orders) || value.orders.some(order => !isRecord(order))) {
        throw new HttpError(502, "invalid checkout response");
    }
    return {
        ...value,
        orders: value.orders.map(order => withPublicOrderMetadata(order as JsonRecord, definitions)),
    };
}

function displayValue(value: unknown): string | undefined {
    if (typeof value === "string" || typeof value === "boolean") return String(value);
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return undefined;
}

function stringValue(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}
