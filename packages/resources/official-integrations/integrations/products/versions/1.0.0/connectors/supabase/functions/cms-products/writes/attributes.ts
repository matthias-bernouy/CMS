import { requireCmsWriteRequest } from "../core/auth.ts";
import { json, withMethod } from "../core/http.ts";
import { readJsonObject } from "../core/records.ts";
import { getOne, rest, restError, restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { attachExternalReference, resolveExternalReference } from "./externalReferences.ts";
import { writePayload, toDbRow, withQueryId } from "./payload.ts";
import { assertCanWrite, insertRow, resolveExisting, updateRow } from "./rows.ts";
import { attributeSpec } from "./specs.ts";

type AttributeOptionInput = {
    value: string;
    label: string | null;
    position: number;
};

export async function writeAttributeCommand(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "POST", async () => {
        const params = new URL(request.url).searchParams;
        const body = withQueryId(await readJsonObject(request), params.get("id"));
        const payload = writePayload(body);
        const options = readAttributeOptions(payload.options);
        const row = toDbRow(payload);
        delete row.options;
        const externalId = await resolveExternalReference(body, attributeSpec.entityType);
        if (externalId && !row.id) row.id = externalId;
        const existing = await resolveExisting(attributeSpec, row);
        assertCanWrite(attributeSpec, row, existing);
        const written = existing
            ? await updateRow(attributeSpec.table, existing.id, row)
            : await insertRow(attributeSpec.table, row);
        await attachExternalReference(body, attributeSpec.entityType, written.id);
        await syncAttributeOptions(written.id, options);
        return json({ ok: true, id: String(written.id) });
    });
}

function readAttributeOptions(value: unknown): AttributeOptionInput[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value.flatMap((entry, index) => {
        const option = normalizeOption(entry, index + 1);
        if (!option || seen.has(option.value)) return [];
        seen.add(option.value);
        return [option];
    });
}

function normalizeOption(entry: unknown, position: number): AttributeOptionInput | null {
    if (typeof entry === "string") {
        const value = entry.trim();
        return value ? { value, label: null, position } : null;
    }
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const record = entry as JsonRecord;
    const value = typeof record.value === "string" ? record.value.trim() : "";
    const label = typeof record.label === "string" && record.label.trim() ? record.label.trim() : null;
    return value ? { value, label, position } : null;
}

async function syncAttributeOptions(attributeId: unknown, options: AttributeOptionInput[] | undefined): Promise<void> {
    const attribute = await getOne("attributes", { id: attributeId }, "id,data_type");
    if (!attribute || attribute.data_type !== "option") {
        await deleteAttributeOptions(attributeId);
        return;
    }
    if (options === undefined) return;
    const existing = await restJson<JsonRecord[]>(
        `attribute_options?attribute_id=eq.${encodeURIComponent(String(attributeId))}&select=id,value,label,position`,
        { method: "GET" },
    );
    const byValue = new Map(existing.map(row => [String(row.value), row]));
    const desiredValues = new Set(options.map(option => option.value));
    for (const option of options) {
        const current = byValue.get(option.value);
        const row = {
            attribute_id: attributeId,
            value: option.value,
            label: option.label,
            position: option.position,
        };
        if (current?.id) await updateRow("attribute_options", current.id, row);
        else await insertRow("attribute_options", row);
    }
    const staleIds = existing
        .filter(row => !desiredValues.has(String(row.value)))
        .map(row => row.id)
        .filter(id => id !== undefined && id !== null);
    if (staleIds.length) await deleteRows(`attribute_options?id=in.(${staleIds.map(id => encodeURIComponent(String(id))).join(",")})`);
}

async function deleteAttributeOptions(attributeId: unknown): Promise<void> {
    await deleteRows(`attribute_options?attribute_id=eq.${encodeURIComponent(String(attributeId))}`);
}

async function deleteRows(path: string): Promise<void> {
    const response = await rest(path, { method: "DELETE", headers: { prefer: "return=minimal" } });
    if (!response.ok) throw await restError(response);
}
