import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, jsonResponse, requestCommerce, setRestResponder } from "../harness";

installCommerceTestEnvironment();

const order = {
    id: 42,
    public_id: "public-42",
    buyer_cms_user_id: "buyer-user-42",
    seller_id: 7,
    metadata: {
        publicNote: "Leave at reception",
        internalRisk: true,
        disabledPublic: "legacy",
    },
};
describe("commerce administrator order metadata", () => {
    test("keeps raw metadata on list and detail responses without loading public definitions", async () => {
        let definitionQueries = 0;
        setRestResponder((request) => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/rpc/list_order_read_model")) {
                return jsonResponse({
                    state: "ok",
                    orders: [order],
                    operations: [],
                    definitions: [],
                    total: 1,
                });
            }
            if (url.pathname.endsWith("/rpc/get_order_detail_read_model")) {
                return jsonResponse({
                    state: "ok",
                    order,
                    lines: [],
                    events: [],
                    seller: null,
                    operation: null,
                    financial_terms: null,
                    fulfillment: null,
                    settlement: null,
                    claim: null,
                    authorization: null,
                    definitions: [],
                });
            }
            if (url.pathname.endsWith("/custom_field_definitions")) {
                definitionQueries += 1;
            }
            return jsonResponse([]);
        });

        const listResponse = await requestCommerce("/admin/orders");
        const detailResponse = await requestCommerce("/admin/order?id=42");
        const list = (await listResponse.json()) as Record<string, any>;
        const detail = (await detailResponse.json()) as Record<string, any>;
        expect(listResponse.status).toBe(200);
        expect(detailResponse.status).toBe(200);
        expect(list.items[0].metadata).toEqual(order.metadata);
        expect(list.items[0]).not.toHaveProperty("metadataEntries");
        expect(detail.metadata).toEqual(order.metadata);
        expect(detail).not.toHaveProperty("metadataEntries");
        expect(definitionQueries).toBe(0);
    });
});
