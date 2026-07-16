import { HttpError } from "../../../core/errors.ts";
import { isRecord } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";

type CategoryScope = "public" | "admin";

type CategoryReadModel = {
    category: JsonRecord;
    parent: JsonRecord | null;
    categoryFields: JsonRecord[];
};

export async function getCategoryReadModel(
    scope: CategoryScope,
    categoryId: number | null,
    fullSlug: string | null,
): Promise<CategoryReadModel | null> {
    const result = await rpc("get_category_read_model", {
        p_scope: scope,
        p_category_id: categoryId,
        p_full_slug: fullSlug,
    });
    if (isRecord(result) && result.state === "not_found") return null;
    if (!isRecord(result) || result.state !== "ok" || !isRecord(result.category)
        || (result.parent !== null && !isRecord(result.parent))
        || !Array.isArray(result.category_fields)
        || !(result.category_fields as unknown[]).every(isRecord)) {
        throw new HttpError(502, "get_category_read_model returned an invalid response");
    }
    return {
        category: result.category,
        parent: result.parent as JsonRecord | null,
        categoryFields: result.category_fields as JsonRecord[],
    };
}
