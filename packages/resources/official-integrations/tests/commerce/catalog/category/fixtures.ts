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
    setRestResponder(request => {
        const url = new URL(request.url);
        const resource = url.pathname.split("/").at(-1);
        if (resource === "categories") {
            const isParent = url.searchParams.get("select") === "id,slug,full_slug,label,status";
            const row = isParent ? parent : category;
            return jsonResponse(row ? [row] : []);
        }
        if (resource === "category_custom_fields") return jsonResponse(fields);
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
