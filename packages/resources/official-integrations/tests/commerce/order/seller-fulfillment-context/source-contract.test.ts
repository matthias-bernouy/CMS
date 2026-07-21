import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Endpoint = {
    endpointId?: string;
    method?: string;
    access?: string;
    targetUrl?: string;
    params?: unknown;
    headers?: unknown;
    output?: Array<{
        body?: {
            properties?: Record<string, {
                semantic?: unknown;
            }>;
            required?: string[];
        };
    }>;
};

describe("commerce seller fulfillment Source contexts", () => {
    test("declares three exact service-only actor-scoped projections", async () => {
        const endpoints = await sourceEndpoints();
        const contracts = [{
            id: "getOrderFulfillmentSellerContext",
            path: "/cms-commerce/system/order/fulfillment/seller-context",
            fields: ["id", "publicId", "orderNumber"],
            required: undefined,
        }, {
            id: "getOrderLabelSellerContext",
            path: "/cms-commerce/system/order/label/seller-context",
            fields: ["publicId", "allowed", "sellerCmsUserId"],
            required: ["publicId", "allowed", "sellerCmsUserId"],
        }, {
            id: "getOrderShipmentCreationSellerContext",
            path: "/cms-commerce/system/order/shipment-creation/seller-context",
            fields: ["id", "publicId", "allowed", "sellerId"],
            required: ["id", "publicId", "allowed", "sellerId"],
        }];

        for (const contract of contracts) {
            const endpoint = endpoints.find(item =>
                item.endpointId === contract.id
            );
            const body = endpoint?.output?.[0]?.body;

            expect(endpoint).toMatchObject({
                method: "GET",
                access: "system",
                targetUrl: expect.stringContaining(contract.path),
            });
            expect(endpoint?.params).toEqual([{
                name: "orderId",
                in: "query",
                type: "string",
            }]);
            expect(endpoint?.headers).toEqual([{
                name: "authorization",
                source: {
                    from: "secret",
                    ref: "{{secrets.cmsApiKey}}",
                    prefix: "Bearer ",
                },
            }, {
                name: "x-cms-user-id",
                source: { from: "computed", ref: "userID" },
            }]);
            expect(Object.keys(body?.properties ?? {})).toEqual(
                contract.fields,
            );
            expect(body?.required).toEqual(contract.required);
        }

        const label = endpoints.find(item =>
            item.endpointId === "getOrderLabelSellerContext"
        );
        expect(label?.output?.[0]?.body?.properties
            ?.sellerCmsUserId?.semantic).toEqual({
            kind: "user-id",
            authority: "cms",
        });
        const creation = endpoints.find(item =>
            item.endpointId === "getOrderShipmentCreationSellerContext"
        );
        expect(creation?.output?.[0]?.body?.properties?.sellerId?.semantic)
            .toEqual({ kind: "user-id", authority: "cms" });
    });
});

async function sourceEndpoints(): Promise<Endpoint[]> {
    const path = resolve(
        import.meta.dir,
        "../../../../integrations/commerce/versions/1.0.0/definition.json",
    );
    const definition = JSON.parse(await readFile(path, "utf8")) as {
        artifacts?: Array<{ type?: string; source?: { endpoints?: Endpoint[] } }>;
    };
    return definition.artifacts?.find(artifact => artifact.type === "source")
        ?.source?.endpoints ?? [];
}
