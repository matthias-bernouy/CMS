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
    setRestResponder(request => {
        const url = new URL(request.url);
        const resource = url.pathname.split("/").at(-1);
        if (resource === "upsert_product") return jsonResponse(row ?? productRow);
        if (resource === "products") return jsonResponse(row ? [row] : []);
        if (resource === "custom_field_definitions") {
            return jsonResponse([{ key: "publicSpec" }, { key: "snake_key" }]);
        }
        if (resource === "product_variant_axes") return jsonResponse(options.emptyRelations ? [] : axes);
        if (resource === "product_variant_axis_values") return jsonResponse(options.emptyRelations ? [] : axisValues);
        if (resource === "product_variants") {
            return jsonResponse(options.emptyRelations ? [] : options.variantRows ?? variants);
        }
        if (resource === "product_variant_selections") {
            return jsonResponse(options.emptyRelations ? [] : options.selectionRows ?? selections);
        }
        if (resource === "product_media") {
            return jsonResponse(options.emptyRelations ? [] : options.mainMedia === false
                ? media.map(item => ({ ...item, is_main: false }))
                : media);
        }
        if (resource === "brands") return jsonResponse([brand]);
        if (resource === "product_categories") return jsonResponse(options.emptyRelations ? [] : categories);
        throw new Error(`Unexpected product request: ${request.url}`);
    });
}

export function productReadResources(): string[] {
    return [
        "product_variant_axes",
        "product_variant_axis_values",
        "product_variants",
        "product_variant_selections",
        "product_media",
        "brands",
        "product_categories",
    ];
}
