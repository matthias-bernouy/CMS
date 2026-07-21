import { describe, expect, test } from "bun:test";
import {
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
