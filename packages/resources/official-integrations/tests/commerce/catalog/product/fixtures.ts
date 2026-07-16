import { jsonResponse, setRestResponder } from "../../harness";
import {
    axes,
    axisValues,
    brand,
    categories,
    media,
    productRow,
    selections,
    variants,
} from "./expected";

type ProductResponderOptions = {
    brandId?: number | null;
    emptyRelations?: boolean;
    mainMedia?: boolean;
    product?: Record<string, unknown> | null;
    selectionRows?: Array<Record<string, unknown>>;
    variantRows?: Array<Record<string, unknown>>;
};

export function useProductResponder(options: ProductResponderOptions = {}): void {
    const row = options.product === undefined
        ? { ...productRow, ...(options.brandId === null ? { brand_id: null } : {}) }
        : options.product;
    setRestResponder(async request => {
        const url = new URL(request.url);
        const resource = url.pathname.split("/").at(-1);
        if (resource === "get_product_read_model" || resource === "upsert_product_read_model") {
            const body = await request.clone().json() as Record<string, unknown>;
            if (!row || (body.p_scope === "public"
                && (row.status !== "active" || row.visibility !== "public"))) {
                return jsonResponse({ state: "not_found" });
            }
            return jsonResponse(productReadModel(row, options, body.p_scope === "public"));
        }
        throw new Error(`Unexpected product request: ${request.url}`);
    });
}

export function productReadModel(
    row: Record<string, unknown>,
    options: ProductResponderOptions = {},
    publicScope = false,
): Record<string, unknown> {
    const empty = options.emptyRelations === true;
    return {
        state: "ok",
        product: row,
        public_metadata_keys: publicScope ? ["publicSpec", "snake_key"] : [],
        axes: empty ? [] : axes,
        values: empty ? [] : axisValues,
        variants: empty ? [] : options.variantRows ?? variants,
        selections: empty ? [] : options.selectionRows ?? selections,
        media: empty ? [] : options.mainMedia === false
            ? media.map(item => ({ ...item, is_main: false }))
            : media,
        brand: row.brand_id ? brand : null,
        categories: empty ? [] : categories,
    };
}
