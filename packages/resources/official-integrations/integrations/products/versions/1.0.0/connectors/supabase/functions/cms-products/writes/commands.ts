import { HttpError } from "../core/errors.ts";
import { requireCmsWriteRequest } from "../core/auth.ts";
import { json, withMethod } from "../core/http.ts";
import { readJsonObject, snakeCase } from "../core/records.ts";
import { getOne, rest, restError } from "../core/rest.ts";
import type { JsonRecord, WriteSpec } from "../core/types.ts";
import { attachExternalReference, resolveExternalReference } from "./externalReferences.ts";
import { writePayload, toDbRow, withQueryDefaults, withQueryId } from "./payload.ts";
import { assertCanWrite, insertRow, resolveExisting, updateRow } from "./rows.ts";

type MainMediaLink = {
    table: "product_media" | "variant_media";
    ownerKey: "product_id" | "variant_id";
};

type WriteCommandOptions = {
    afterWrite?: (id: string | number, body: JsonRecord) => Promise<void>;
    omitPayloadKeys?: string[];
};

export async function writeCommand(
    request: Request,
    spec: WriteSpec,
    mainMedia?: MainMediaLink,
    queryDefaults: string[] = [],
    options: WriteCommandOptions = {},
): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "POST", async () => {
        const params = new URL(request.url).searchParams;
        const body = withQueryDefaults(withQueryId(await readJsonObject(request), params.get("id")), params, queryDefaults);
        const row = await normalizeWriteRow(body, spec, options.omitPayloadKeys ?? []);
        const mainImageMediaId = mainMediaId(body);
        delete row.main_image_media_id;
        const id = await writeByResolution(spec, row, body);
        if (mainMedia && mainImageMediaId) await linkMainMedia(mainMedia, id, mainImageMediaId);
        if (options.afterWrite) await options.afterWrite(id, body);
        return json({ ok: true, id: String(id) });
    });
}

async function normalizeWriteRow(body: JsonRecord, spec: WriteSpec, omitPayloadKeys: string[]): Promise<JsonRecord> {
    const row = toDbRow(writePayload(body));
    omitKeys(row, omitPayloadKeys);
    if (spec.table === "products") normalizeProductRow(row);
    const externalId = await resolveExternalReference(body, spec.entityType);
    if (externalId && !row.id) row.id = externalId;
    return row;
}

function normalizeProductRow(row: JsonRecord): void {
    if (row.brand_id === "") row.brand_id = null;
    if (row.description === "") row.description = null;
}

function omitKeys(row: JsonRecord, keys: string[]): void {
    for (const key of keys) {
        delete row[key];
        delete row[snakeCase(key)];
    }
}

async function writeByResolution(spec: WriteSpec, row: JsonRecord, body: JsonRecord): Promise<string | number> {
    if (!Object.keys(row).length) throw new HttpError(400, "body does not contain writable fields");
    const existing = await resolveExisting(spec, row);
    assertCanWrite(spec, row, existing);
    const written = existing
        ? await updateRow(spec.table, existing.id, row)
        : await insertRow(spec.table, row);

    await attachExternalReference(body, spec.entityType, written.id);
    return written.id as string | number;
}

async function linkMainMedia(link: MainMediaLink, ownerId: string | number, mediaId: string): Promise<void> {
    await unsetCurrentMainMedia(link, ownerId);
    const existing = await getOne(link.table, { [link.ownerKey]: ownerId, media_id: mediaId }, "id");
    const row = { [link.ownerKey]: ownerId, media_id: mediaId, sort_order: 0, is_main: true };
    if (existing) await updateRow(link.table, existing.id, row);
    else await insertRow(link.table, row);
}

async function unsetCurrentMainMedia(link: MainMediaLink, ownerId: string | number): Promise<void> {
    const response = await rest(
        `${link.table}?${link.ownerKey}=eq.${encodeURIComponent(String(ownerId))}&is_main=eq.true&select=id`,
        {
            method: "PATCH",
            headers: {
                "content-type": "application/json",
                prefer: "return=minimal",
            },
            body: JSON.stringify({ is_main: false }),
        },
    );
    if (!response.ok) throw await restError(response);
}

function mainMediaId(body: JsonRecord): string | undefined {
    const payload = writePayload(body);
    const value = payload.mainImageMediaId ?? payload.main_image_media_id;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
