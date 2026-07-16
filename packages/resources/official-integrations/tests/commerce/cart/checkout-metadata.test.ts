import { describe, expect, test } from "bun:test";
import {
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../harness";

installCommerceTestEnvironment();

describe("commerce cart checkout metadata", () => {
    test("filters every created order and adds ordered public metadata entries", async () => {
        setRestResponder(request => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/custom_field_definitions")) {
                expect(url.searchParams.get("entity_type")).toBe("eq.order");
                expect(url.searchParams.get("enabled")).toBe("eq.true");
                expect(url.searchParams.get("public_readable")).toBe("eq.true");
                expect(url.searchParams.get("order")).toBe("position.asc,key.asc");
                return jsonResponse([
                    { key: "gift", label: "Gift", field_type: "boolean", unit: null, position: 5 },
                    { key: "note", label: "Delivery note", field_type: "string", unit: null, position: 10 },
                ]);
            }
            expect(url.pathname).toEndWith("/rpc/checkout_cart");
            return jsonResponse({
                checkout_group_id: "group-42",
                idempotent_replay: false,
                orders: [
                    { id: 42, metadata: { note: "First", gift: true, internalRisk: "high" } },
                    { id: 43, metadata: { note: "Second", gift: false, internalRisk: "low" } },
                ],
            });
        });

        const response = await requestCommerce("/me/cart/checkout", {
            userId: "buyer-user-42",
            body: {
                expectedVersion: 7,
                idempotencyKey: "checkout-42",
                metadata: { note: "First", gift: true },
            },
        });
        const body = await response.json() as Record<string, any>;

        expect(response.status).toBe(201);
        expect(body.orders).toEqual([
            {
                id: 42,
                metadata: { note: "First", gift: true },
                metadataEntries: [
                    { key: "gift", label: "Gift", type: "boolean", value: "true" },
                    { key: "note", label: "Delivery note", type: "string", value: "First" },
                ],
            },
            {
                id: 43,
                metadata: { note: "Second", gift: false },
                metadataEntries: [
                    { key: "gift", label: "Gift", type: "boolean", value: "false" },
                    { key: "note", label: "Delivery note", type: "string", value: "Second" },
                ],
            },
        ]);
        expect(JSON.stringify(body)).not.toContain("internalRisk");
    });

    test("fails closed when checkout does not return an order list", async () => {
        setRestResponder(request => new URL(request.url).pathname.endsWith("/custom_field_definitions")
            ? jsonResponse([])
            : jsonResponse({
                checkout_group_id: "group-unsafe",
                orders: { metadata: { internalRisk: "must-not-leak" } },
                idempotent_replay: false,
            }));

        const response = await requestCommerce("/me/cart/checkout", {
            userId: "buyer-user-456",
            body: { expectedVersion: 7, idempotencyKey: "checkout-unsafe" },
        });

        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "invalid checkout response" });
    });
});
