import { HttpError } from "../core/errors.ts";
import { requireCmsWriteRequest } from "../core/auth.ts";
import { json, withMethod } from "../core/http.ts";
import { readJsonObject } from "../core/records.ts";
import { getOne, rest, restError, restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { toDbRow, withQueryDefaults, withQueryId, writePayload } from "./payload.ts";
import { assertCanWrite, insertRow, resolveExisting, updateRow } from "./rows.ts";
import { productVariantAxisSpec } from "./specs.ts";

export async function writeProductVariantAxisCommand(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "POST", async () => {
        const params = new URL(request.url).searchParams;
        const body = withQueryDefaults(withQueryId(await readJsonObject(request), params.get("id")), params, ["productId"]);
        const payload = writePayload(body);
        const optionIds = readOptionIds(payload.optionIds ?? payload.option_ids);
        const row = toDbRow(payload);
        delete row.option_ids;
        const existing = await resolveExisting(productVariantAxisSpec, row);
        assertCanWrite(productVariantAxisSpec, row, existing);
        const written = existing
            ? await updateRow(productVariantAxisSpec.table, existing.id, row)
            : await insertRow(productVariantAxisSpec.table, row);
        if (optionIds) await syncAxisOptions(row.product_id, row.attribute_id, optionIds);
        return json({ ok: true, id: String(written.id), optionCount: optionIds?.length ?? undefined });
    });
}

function readOptionIds(value: unknown): string[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value
        .map(entry => typeof entry === "number" ? String(entry) : typeof entry === "string" ? entry.trim() : "")
        .filter(Boolean)));
}

async function syncAxisOptions(productId: unknown, attributeId: unknown, optionIds: string[]): Promise<void> {
    if (!productId || !attributeId) throw new HttpError(400, "productId and attributeId are required");
    const attribute = await getOne("attributes", { id: attributeId }, "id,data_type");
    if (!attribute || attribute.data_type !== "option") throw new HttpError(400, "variant axes require an option attribute");
    const options = await restJson<JsonRecord[]>(
        `attribute_options?attribute_id=eq.${encodeURIComponent(String(attributeId))}&id=in.(${optionIds.map(encodeURIComponent).join(",")})&select=id`,
        { method: "GET" },
    );
    const valid = new Set(options.map(option => String(option.id)));
    const invalid = optionIds.filter(id => !valid.has(id));
    if (invalid.length) throw new HttpError(400, "optionIds must belong to the selected attribute");
    await deleteRows(`product_variant_axis_options?product_id=eq.${encodeURIComponent(String(productId))}&attribute_id=eq.${encodeURIComponent(String(attributeId))}`);
    for (const [index, optionId] of optionIds.entries()) {
        await insertRow("product_variant_axis_options", {
            product_id: productId,
            attribute_id: attributeId,
            option_id: optionId,
            position: index + 1,
        });
    }
}

async function deleteRows(path: string): Promise<void> {
    const response = await rest(path, { method: "DELETE", headers: { prefer: "return=minimal" } });
    if (!response.ok) throw await restError(response);
}
