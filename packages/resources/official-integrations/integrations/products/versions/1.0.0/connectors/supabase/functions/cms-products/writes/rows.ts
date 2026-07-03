import { HttpError } from "../core/errors.ts";
import { firstRow, stripUndefined } from "../core/records.ts";
import { getOne, rest, restError } from "../core/rest.ts";
import type { JsonRecord, WriteSpec } from "../core/types.ts";

export async function insertRow(table: string, row: JsonRecord): Promise<JsonRecord> {
    const response = await rest(`${table}?select=id`, {
        method: "POST",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(stripUndefined(row)),
    });
    if (!response.ok) throw await restError(response);
    return firstRow(await response.json());
}

export async function updateRow(table: string, id: unknown, row: JsonRecord): Promise<JsonRecord> {
    const patch = { ...row };
    delete patch.id;
    const response = await rest(`${table}?id=eq.${encodeURIComponent(String(id))}&select=id`, {
        method: "PATCH",
        headers: {
            "content-type": "application/json",
            prefer: "return=representation",
        },
        body: JSON.stringify(stripUndefined(patch)),
    });
    if (!response.ok) throw await restError(response);
    return firstRow(await response.json());
}

export async function resolveExisting(spec: WriteSpec, row: JsonRecord): Promise<JsonRecord | null> {
    if (row.id) return await getOne(spec.table, { id: row.id }, "id");
    const natural = spec.naturalKey(row);
    if (!natural) return null;
    return await getOne(spec.table, natural, "id");
}

export function assertCanWrite(spec: WriteSpec, row: JsonRecord, existing: JsonRecord | null): void {
    const hasExplicitId = row.id !== undefined && row.id !== null && row.id !== "";
    if (!existing && hasExplicitId && !spec.allowInsertWithId) {
        throw new HttpError(404, `${spec.entityType} not found`);
    }
}
