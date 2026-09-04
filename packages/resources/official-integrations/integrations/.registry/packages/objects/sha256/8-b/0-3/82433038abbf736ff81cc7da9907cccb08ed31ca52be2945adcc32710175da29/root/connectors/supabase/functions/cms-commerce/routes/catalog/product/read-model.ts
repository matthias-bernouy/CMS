import { HttpError } from "../../../core/errors.ts";
import { isRecord } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import type { JsonRecord } from "../../../core/types.ts";
import type { ProductReadBundle } from "./data.ts";

type ProductScope = "public" | "admin";

export async function getProductReadModel(
    scope: ProductScope,
    productId: number | null,
    slug: string | null,
): Promise<ProductReadBundle | null> {
    const result = await rpc("get_product_read_model", {
        p_scope: scope,
        p_product_id: productId,
        p_slug: slug,
    });
    if (isRecord(result) && result.state === "not_found") {
        return null;
    }
    return bundle(result, "get_product_read_model returned an invalid response");
}

export async function upsertProductReadModel(
    productId: number | null,
    payload: JsonRecord,
    expectedVersion: number | undefined,
): Promise<ProductReadBundle> {
    return bundle(
        await rpc("upsert_product_read_model", {
            p_product_id: productId,
            p_payload: payload,
            p_expected_version: expectedVersion,
        }),
        "upsert_product returned an invalid response",
    );
}

function bundle(value: unknown, message: string): ProductReadBundle {
    if (
        !isRecord(value) ||
        value.state !== "ok" ||
        !isRecord(value.product) ||
        !Array.isArray(value.public_metadata_keys) ||
        !recordArrays(value, ["axes", "values", "variants", "selections", "media", "categories"]) ||
        (value.brand !== null && !isRecord(value.brand)) ||
        !(value.public_metadata_keys as unknown[]).every((key) => typeof key === "string")
    ) {
        throw new HttpError(502, message);
    }
    return {
        product: value.product,
        publicMetadataKeys: value.public_metadata_keys as string[],
        axes: value.axes as JsonRecord[],
        values: value.values as JsonRecord[],
        variants: value.variants as JsonRecord[],
        selections: value.selections as JsonRecord[],
        media: value.media as JsonRecord[],
        brand: value.brand as JsonRecord | null,
        categories: value.categories as JsonRecord[],
    };
}

function recordArrays(value: JsonRecord, keys: string[]): boolean {
    return keys.every((key) => Array.isArray(value[key]) && (value[key] as unknown[]).every(isRecord));
}
