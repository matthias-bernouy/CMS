import { describe, expect, test } from "bun:test";
import { installCommerceTestEnvironment, jsonResponse, requestCommerce, setRestResponder } from "../../harness";

installCommerceTestEnvironment();

const buyerId = "buyer-user-42";
const order = {
    id: 42,
    public_id: "public-42",
    buyer_cms_user_id: buyerId,
    seller_id: 7,
    metadata: {
        publicNote: "Leave at reception",
        weight: 305,
        internalRisk: true,
        disabledPublic: "legacy",
    },
};
const publicDefinitions = [
    {
        key: "weight",
        label: "Weight",
        field_type: "number",
        unit: "g",
        enabled: true,
        public_readable: true,
        position: 10,
    },
    {
        key: "publicNote",
        label: "Delivery note",
        field_type: "string",
        unit: null,
        enabled: true,
        public_readable: true,
        position: 20,
    },
];
const expectedMetadata = { publicNote: "Leave at reception", weight: 305 };
const expectedEntries = [
    { key: "weight", label: "Weight", type: "number", value: "305", unit: "g" },
    { key: "publicNote", label: "Delivery note", type: "string", value: "Leave at reception" },
];

describe("commerce buyer order metadata", () => {
    test("returns only enabled public metadata on buyer list and detail responses", async () => {
        let detailQueries = 0;
        setRestResponder((request) => {
            const url = new URL(request.url);
            if (url.pathname.endsWith("/rpc/list_order_read_model")) {
                return jsonResponse({
                    state: "ok",
                    orders: [order],
                    operations: [],
                    definitions: publicDefinitions,
                    total: 1,
                });
            }
            if (url.pathname.endsWith("/rpc/get_order_detail_read_model")) {
                detailQueries += 1;
                return jsonResponse(detailEnvelope(publicDefinitions));
            }
            return jsonResponse([]);
        });

        const listResponse = await requestCommerce("/me/orders", { userId: buyerId });
        const detailResponse = await requestCommerce("/me/order?id=42", { userId: buyerId });
        const list = (await listResponse.json()) as Record<string, any>;
        const detail = (await detailResponse.json()) as Record<string, any>;

        expect(listResponse.status).toBe(200);
        expect(detailResponse.status).toBe(200);
        expect(list.items[0].metadata).toEqual(expectedMetadata);
        expect(list.items[0].metadataEntries).toEqual(expectedEntries);
        expect(detail.metadata).toEqual(expectedMetadata);
        expect(detail.metadataEntries).toEqual(expectedEntries);
        expect(JSON.stringify({ list, detail })).not.toContain("internalRisk");
        expect(JSON.stringify({ list, detail })).not.toContain("disabledPublic");
        expect(detailQueries).toBe(1);
    });

    test("closes buyer metadata when no definition is both enabled and public", async () => {
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
            return jsonResponse([]);
        });

        const response = await requestCommerce("/me/orders", { userId: buyerId });
        const body = (await response.json()) as Record<string, any>;

        expect(response.status).toBe(200);
        expect(body.items[0].metadata).toEqual({});
        expect(body.items[0].metadataEntries).toEqual([]);
    });
});

function detailEnvelope(definitions: Record<string, unknown>[]): Record<string, unknown> {
    return {
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
        definitions,
    };
}
