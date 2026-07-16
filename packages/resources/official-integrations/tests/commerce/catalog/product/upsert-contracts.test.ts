import { describe, expect, test } from "bun:test";
import {
    capturedFetches,
    expectRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { adminProduct } from "./expected";
import { useProductResponder } from "./fixtures";

installCommerceTestEnvironment();

describe("commerce product upsert contracts", () => {
    test("preserves the complete response in one database call after an update", async () => {
        useProductResponder();

        const response = await requestCommerce("/admin/product?id=42", {
            userRole: null,
            body: {
                expectedVersion: 2,
                title: "Racket Pro",
                metadata: { publicSpec: "graphite", privateCost: 12000 },
                variants: [{ id: 999 }],
                variantMatrix: [{ key: "client-supplied" }],
            },
        });
        const body = await response.json();
        const calls = capturedFetches();

        expect(response.status).toBe(200);
        expect(body).toEqual(adminProduct);
        expect(calls).toHaveLength(1);
        expect(expectRpc("upsert_product_read_model").body).toEqual({
            p_product_id: 42,
            p_payload: {
                expectedVersion: 2,
                title: "Racket Pro",
                metadata: { publicSpec: "graphite", privateCost: 12000 },
            },
            p_expected_version: 2,
        });
    });

    test("treats __new__ as creation and does not require an expected version", async () => {
        useProductResponder({ brandId: null });

        const response = await requestCommerce("/admin/product?id=__new__", {
            body: { slug: "racket-pro", title: "Racket Pro" },
        });

        expect(response.status).toBe(200);
        const rpc = expectRpc("upsert_product_read_model");
        expect(rpc.body).toEqual({
            p_product_id: null,
            p_payload: { slug: "racket-pro", title: "Racket Pro" },
        });
        expect(rpc.body).not.toHaveProperty("p_expected_version");
        expect(capturedFetches()).toHaveLength(1);
    });

    test("rejects a missing update version before mutating", async () => {
        const response = await requestCommerce("/admin/product?id=42", {
            body: { title: "Racket Pro" },
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({ error: "expectedVersion is required" });
        expect(capturedFetches()).toEqual([]);
    });

    test("rejects an invalid generated matrix before mutating", async () => {
        const response = await requestCommerce("/admin/product?id=42", {
            body: {
                expectedVersion: 2,
                variantAxes: [
                    { label: "A", values: Array.from({ length: 11 }, (_, index) => `A${index}`) },
                    { label: "B", values: Array.from({ length: 10 }, (_, index) => `B${index}`) },
                ],
            },
        });

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ error: "variant axes cannot generate more than 100 combinations" });
        expect(capturedFetches()).toEqual([]);
    });

    for (const scenario of rpcErrors) {
        test(`preserves the ${scenario.status} RPC error mapping`, async () => {
            setRestResponder(() => jsonResponse({ message: scenario.message }, scenario.upstreamStatus));

            const response = await requestCommerce("/admin/product?id=42", {
                body: { expectedVersion: 2, title: "Racket Pro" },
            });

            expect(response.status).toBe(scenario.status);
            expect(await response.json()).toEqual({ error: scenario.error });
            expect(capturedFetches()).toHaveLength(1);
        });
    }

    test("fails closed when the mutation RPC does not return an object", async () => {
        setRestResponder(() => jsonResponse([]));

        const response = await requestCommerce("/admin/product?id=42", {
            body: { expectedVersion: 2, title: "Racket Pro" },
        });

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "upsert_product returned an invalid response" });
        expect(capturedFetches()).toHaveLength(1);
    });
});

const rpcErrors = [
    { upstreamStatus: 400, message: "validation: invalid product", status: 422, error: "invalid product" },
    { upstreamStatus: 400, message: "conflict: stale product version", status: 409, error: "stale product version" },
    { upstreamStatus: 400, message: "not_found: product", status: 404, error: "product" },
] as const;
