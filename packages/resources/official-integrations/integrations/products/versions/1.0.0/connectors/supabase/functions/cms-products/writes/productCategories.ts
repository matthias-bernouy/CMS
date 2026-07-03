import { rest, restError, restJson } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { writePayload } from "./payload.ts";
import { insertRow, updateRow } from "./rows.ts";

export async function syncProductCategories(productId: string | number, body: JsonRecord): Promise<void> {
    const desired = categoryIds(body);
    if (desired === undefined) return;

    const current = await restJson<JsonRecord[]>(
        `product_categories?product_id=eq.${encodeURIComponent(String(productId))}&select=id,category_id,position`,
        { method: "GET" },
    );
    const desiredSet = new Set(desired);

    await Promise.all(current
        .filter(row => !desiredSet.has(String(row.category_id ?? "")))
        .map(row => deleteProductCategory(row.id)));

    for (const [index, categoryId] of desired.entries()) {
        const existing = current.find(row => String(row.category_id ?? "") === categoryId);
        const position = index + 1;
        if (existing) {
            if (Number(existing.position ?? 0) !== position) await updateRow("product_categories", existing.id, { position });
        } else {
            await insertRow("product_categories", {
                product_id: productId,
                category_id: categoryId,
                position,
            });
        }
    }
}

function categoryIds(body: JsonRecord): string[] | undefined {
    const payload = writePayload(body);
    const value = payload.categoryIds ?? payload.category_ids;
    if (value === undefined) return undefined;
    if (Array.isArray(value)) return cleanIds(value);
    if (typeof value === "string") return cleanIds(value.split(","));
    return [];
}

function cleanIds(values: unknown[]): string[] {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const value of values) {
        const id = typeof value === "number" && Number.isFinite(value) ? String(value) : String(value ?? "").trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        ids.push(id);
    }
    return ids;
}

async function deleteProductCategory(id: unknown): Promise<void> {
    const response = await rest(`product_categories?id=eq.${encodeURIComponent(String(id))}`, {
        method: "DELETE",
        headers: { prefer: "return=minimal" },
    });
    if (!response.ok) throw await restError(response);
}
