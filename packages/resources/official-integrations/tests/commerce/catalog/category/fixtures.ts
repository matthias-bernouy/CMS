import { jsonResponse, setRestResponder } from "../../harness";
import type { JsonRecord } from "../../harness";
import { categoryFieldRows, categoryRow, parentRow } from "./expected";

type CategoryResponderOptions = {
    category?: JsonRecord | null;
    parent?: JsonRecord | null;
    fields?: JsonRecord[];
};

export function useCategoryResponder(options: CategoryResponderOptions = {}): void {
    const category = options.category === undefined ? categoryRow : options.category;
    const parent = options.parent === undefined ? parentRow : options.parent;
    const fields = options.fields ?? categoryFieldRows;
    setRestResponder(async (request) => {
        const url = new URL(request.url);
        const resource = url.pathname.split("/").at(-1);
        if (resource === "get_category_read_model") {
            const body = (await request.clone().json()) as Record<string, unknown>;
            if (!category || (body.p_scope === "public" && category.status !== "active")) {
                return jsonResponse({ state: "not_found" });
            }
            return jsonResponse({
                state: "ok",
                category,
                parent: category.parent_id ? parent : null,
                category_fields: body.p_scope === "admin" ? fields : [],
            });
        }
        throw new Error(`Unexpected category request: ${request.url}`);
    });
}

export function rootCategoryRow(): JsonRecord {
    return {
        ...categoryRow,
        id: 3,
        parent_id: null,
        slug: "sports",
        full_slug: "sports",
        label: "Sports",
        description: "All sports",
        metadata: {},
        version: 5,
    };
}
