import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
    type JsonRecord,
} from "../harness";

installCommerceTestEnvironment();

describe("commerce product writes", () => {
    test("derives the variant matrix from axes and rejects arbitrary variants", async () => {
        setRestResponder((request) =>
            request.url.endsWith("/rpc/upsert_product_read_model")
                ? jsonResponse({
                      state: "ok",
                      product: {
                          id: 42,
                          slug: "racket",
                          title: "Racket",
                          status: "active",
                          visibility: "public",
                          metadata: {},
                          version: 5,
                      },
                      public_metadata_keys: [],
                      axes: [],
                      values: [],
                      variants: [],
                      selections: [],
                      media: [],
                      brand: null,
                      categories: [],
                  })
                : jsonResponse([]),
        );

        const response = await requestCommerce("/admin/product?id=42", {
            body: {
                expectedVersion: 4,
                slug: "racket",
                title: "Racket",
                variantAxes: [
                    { fieldKey: "color", values: ["Red", "Blue"] },
                    { label: "Size", values: ["S", "M", "L"] },
                ],
                variantMatrix: [{ key: "arbitrary:matrix" }],
                variants: [{ id: 999, title: "Arbitrary variant" }],
            },
        });

        const call = expectRpc("upsert_product_read_model");
        const payload = call.body.p_payload as JsonRecord;
        const matrix = payload.variantMatrix as JsonRecord[];

        expect(response.status).toBe(200);
        expect(call.body).toMatchObject({
            p_product_id: 42,
            p_expected_version: 4,
        });
        expect(payload).not.toHaveProperty("variants");
        expect(payload.variantAxes).toEqual(
            expect.arrayContaining([expect.objectContaining({ key: "color", fieldKey: "color", label: "color" })]),
        );
        expect(matrix).toHaveLength(6);
        expect(matrix.map((row) => row.key)).toEqual([
            "color:red|size:s",
            "color:red|size:m",
            "color:red|size:l",
            "color:blue|size:s",
            "color:blue|size:m",
            "color:blue|size:l",
        ]);
        expect(matrix).not.toEqual(expect.arrayContaining([expect.objectContaining({ key: "arbitrary:matrix" })]));
        expect(
            matrix.every((row) => row.status === "active" && Array.isArray(row.choices) && row.choices.length === 2),
        ).toBeTrue();
    });
});

describe("commerce Brand post-action parity", () => {
    test("returns the exact saved Brand read model", async () => {
        const row = {
            id: 7,
            slug: "babolat",
            name: "Babolat",
            description: null,
            status: "active",
            metadata: { region: null },
            version: 4,
            created_at: "2026-07-01T08:00:00Z",
            updated_at: "2026-07-22T11:00:00Z",
        };
        setRestResponder((request) =>
            new URL(request.url).pathname.endsWith("/rpc/upsert_brand") ? jsonResponse(row) : jsonResponse([row]),
        );
        const body = {
            expectedVersion: 3,
            slug: "babolat",
            name: "Babolat",
            description: "",
            status: "active",
        };

        const mutation = await requestCommerce("/admin/brand?id=7", { body });
        const saved = await mutation.json();
        const detail = await requestCommerce("/admin/brand?id=7");
        const fetched = await detail.json();

        expect(mutation.status).toBe(200);
        expect(detail.status).toBe(200);
        expect(saved).toEqual(brandProjection);
        expect(fetched).toEqual(brandProjection);
        expect(saved).toEqual(fetched);
        expect(pick(saved as JsonRecord, brandConsumedFields)).toEqual(pick(brandProjection, brandConsumedFields));
        expect(capturedFetches()).toHaveLength(2);
        expect(expectRpc("upsert_brand").body).toEqual({
            p_brand_id: 7,
            p_payload: body,
            p_expected_version: 3,
        });
        expect(capturedFetches().map((request) => new URL(request.url).pathname)).toEqual([
            "/rest/v1/rpc/upsert_brand",
            "/rest/v1/brands",
        ]);
    });
});

const brandProjection = {
    id: 7,
    slug: "babolat",
    name: "Babolat",
    description: null,
    status: "active",
    metadata: { region: null },
    version: 4,
    createdAt: "2026-07-01T08:00:00Z",
    updatedAt: "2026-07-22T11:00:00Z",
};

const brandConsumedFields = ["id", "slug", "name", "description", "status", "version"] as const;

function pick(value: JsonRecord, keys: readonly string[]): JsonRecord {
    return Object.fromEntries(keys.map((key) => [key, value[key]]));
}
