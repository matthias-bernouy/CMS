import { integer, publicMetadata } from "../core/records.ts";
import { restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";

export async function redactOfferMetadata(rows: JsonRecord[]): Promise<JsonRecord[]> {
    const allowed = await publicMetadataKeys("offer");
    return rows.map((row) => ({ ...row, metadata: publicMetadata(row.metadata, allowed) }));
}

async function publicMetadataKeys(entityType: string): Promise<Set<string>> {
    const definitions = await restJson<JsonRecord[]>(
        `custom_field_definitions?select=key&entity_type=eq.${entityType}&public_readable=eq.true&enabled=eq.true`,
    );
    return new Set(definitions.map((row) => String(row.key)));
}

export function addFilter(params: URLSearchParams, column: string, value: string | null, allowed: boolean): void {
    if (allowed && value?.trim()) {
        params.set(column, `eq.${value.trim()}`);
    }
}

export function optionalId(value: string | null): number | null {
    if (!value || value === "__new__") {
        return null;
    }
    return integer(value, "id", true)!;
}

export function sellerOfferPayload(body: JsonRecord): JsonRecord {
    const allowed = [
        "slug",
        "title",
        "description",
        "productId",
        "variantId",
        "conditionCode",
        "currency",
        "publicationStatus",
        "availability",
        "quantityAvailable",
        "metadata",
    ];
    return Object.fromEntries(allowed.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
}
