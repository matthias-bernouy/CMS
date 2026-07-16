import { describe, expect, test } from "bun:test";
import {
    expectRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../harness";

installCommerceTestEnvironment();

describe("commerce created order metadata", () => {
    test("filters the createOrder response and returns ordered public metadata entries", async () => {
        setRestResponder(request => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/rpc/create_order_from_offers")) {
                return jsonResponse({
                    id: 42,
                    buyer_cms_user_id: "buyer-user-42",
                    metadata: { internalRisk: true, publicNote: "Ring twice", weight: 305 },
                    idempotent_replay: false,
                });
            }
            expect(url.pathname).toEndWith("/custom_field_definitions");
            expect(url.searchParams.get("enabled")).toBe("eq.true");
            expect(url.searchParams.get("public_readable")).toBe("eq.true");
            return jsonResponse([
                { key: "weight", label: "Weight", field_type: "number", unit: "g", position: 5 },
                { key: "publicNote", label: "Delivery note", field_type: "string", unit: null, position: 10 },
            ]);
        });

        const response = await requestCommerce("/me/orders", {
            userId: "buyer-user-42",
            body: {
                idempotencyKey: "checkout-42",
                items: [{ offerId: 91, quantity: 1 }],
                metadata: { publicNote: "Ring twice", weight: 305 },
            },
        });
        const body = await response.json() as Record<string, any>;

        expect(response.status).toBe(201);
        expect(body.metadata).toEqual({ publicNote: "Ring twice", weight: 305 });
        expect(body.metadataEntries).toEqual([
            { key: "weight", label: "Weight", type: "number", value: "305", unit: "g" },
            { key: "publicNote", label: "Delivery note", type: "string", value: "Ring twice" },
        ]);
        expect(body.metadata).not.toHaveProperty("internalRisk");
        expect(expectRpc("create_order_from_offers").body.p_metadata).toEqual({
            publicNote: "Ring twice",
            weight: 305,
        });
    });

    test("fails closed when order creation returns a non-object", async () => {
        setRestResponder(request => new URL(request.url).pathname.endsWith("/custom_field_definitions")
            ? jsonResponse([])
            : jsonResponse([{ metadata: { internalRisk: "must-not-leak" } }]));

        const response = await requestCommerce("/me/orders", {
            userId: "buyer-user-42",
            body: {
                idempotencyKey: "checkout-invalid-response",
                items: [{ offerId: 91, quantity: 1 }],
            },
        });

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "invalid order response" });
    });
});
