import { describe, expect, test } from "bun:test";
import { capturedFetches, expectRpc, installCommerceTestEnvironment, requestCommerce } from "../../harness";
import { adminProduct } from "./expected";
import { useProductResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce Product post-action parity", () => {
    for (const scenario of [
        {
            name: "updated Product",
            id: "42",
            body: { expectedVersion: 2, title: "Racket Pro" },
            mutationBody: {
                p_product_id: 42,
                p_payload: { expectedVersion: 2, title: "Racket Pro" },
                p_expected_version: 2,
            },
        },
        {
            name: "new Product",
            id: "__new__",
            body: { slug: "racket-pro", title: "Racket Pro" },
            mutationBody: {
                p_product_id: null,
                p_payload: { slug: "racket-pro", title: "Racket Pro" },
            },
        },
    ] as const) {
        test(`returns the exact ${scenario.name} read model without a second mutation call`, async () => {
            useProductResponder();

            const mutation = await requestCommerce(`/admin/product?id=${scenario.id}`, { body: scenario.body });
            const saved = await mutation.json();
            const detail = await requestCommerce(`/admin/product?id=${String((saved as { id: number }).id)}`);
            const fetched = await detail.json();

            expect(mutation.status).toBe(200);
            expect(detail.status).toBe(200);
            expect(saved).toEqual(adminProduct);
            expect(fetched).toEqual(adminProduct);
            expect(saved).toEqual(fetched);
            expect(pick(saved as Record<string, unknown>, productConsumedFields)).toEqual(productConsumedProjection);
            expect(capturedFetches()).toHaveLength(2);
            expect(expectRpc("upsert_product_read_model").body).toEqual(scenario.mutationBody);
            expect(expectRpc("get_product_read_model").body).toEqual({
                p_scope: "admin",
                p_product_id: 42,
                p_slug: null,
            });
        });
    }
});

const productConsumedFields = [
    "id",
    "slug",
    "title",
    "description",
    "brandId",
    "brand",
    "primaryCategoryId",
    "primaryCategory",
    "metadata",
    "media",
    "variantAxes",
    "variantMatrix",
    "status",
    "visibility",
    "version",
] as const;

const productConsumedProjection = pick(adminProduct, productConsumedFields);

function pick(value: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
    return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
