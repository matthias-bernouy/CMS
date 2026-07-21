import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, jsonResponse, requestCommerce, setRestResponder } from "../harness";

installCommerceTestEnvironment();

const sellerId = "seller-user-17";
const sale = {
    id: 42,
    public_id: "public-42",
    order_number: "CO-42",
    checkout_group_id: "group-42",
    status: "placed",
    currency: "eur",
    subtotal_amount: 10000,
    total_amount: 10000,
    metadata: {
        publicNote: "Ring twice",
        insured: true,
        internalRisk: "high",
        disabledPublic: "legacy",
    },
};
const publicDefinitions = [
    { key: "insured", label: "Insured", field_type: "boolean", unit: null, position: 5 },
    { key: "publicNote", label: "Delivery note", field_type: "string", unit: null, position: 10 },
];

describe("commerce seller order metadata", () => {
    test("returns only enabled public fields on seller list and detail responses", async () => {
        let detailQueries = 0;
        setRestResponder((request) => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/rpc/list_order_read_model")) {
                return jsonResponse({
                    state: "ok",
                    orders: [sale],
                    operations: [],
                    definitions: publicDefinitions,
                    total: 1,
                });
            }
            if (url.pathname.endsWith("/rpc/get_order_detail_read_model")) {
                detailQueries += 1;
                return jsonResponse({
                    state: "ok",
                    order: sale,
                    lines: [],
                    events: [],
                    seller: null,
                    operation: null,
                    financial_terms: null,
                    fulfillment: null,
                    settlement: null,
                    claim: null,
                    authorization: null,
                    definitions: publicDefinitions,
                });
            }
            return jsonResponse([]);
        });

        const listResponse = await requestCommerce("/me/sales", { userId: sellerId });
        const detailResponse = await requestCommerce("/me/sale?id=42", { userId: sellerId });
        const list = (await listResponse.json()) as Record<string, any>;
        const detail = (await detailResponse.json()) as Record<string, any>;
        const metadata = { publicNote: "Ring twice", insured: true };
        const entries = [
            { key: "insured", label: "Insured", type: "boolean", value: "true" },
            { key: "publicNote", label: "Delivery note", type: "string", value: "Ring twice" },
        ];

        expect(listResponse.status).toBe(200);
        expect(detailResponse.status).toBe(200);
        expect(list.items[0]).toMatchObject({ metadata, metadataEntries: entries });
        expect(detail).toMatchObject({ metadata, metadataEntries: entries });
        expect(JSON.stringify({ list, detail })).not.toContain("internalRisk");
        expect(JSON.stringify({ list, detail })).not.toContain("disabledPublic");
        expect(detailQueries).toBe(1);
    });
});
