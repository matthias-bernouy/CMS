import { describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import { resolve } from "node:path";
import { loadIntegrationDefinition } from "../../../helpers/integrationDefinition";
import { installCommerceTestEnvironment, requestCommerce } from "../../harness";
import {
    expectedAdminSourceDetail,
    expectedAdminSourceList,
    expectedBuyerSourceDetail,
    expectedBuyerSourceList,
    expectedSellerSourceDetail,
    expectedSellerSourceList,
} from "./fixtures/expected-source";
import { buyerId, sellerUserId } from "./fixtures/raw";
import { useCompleteOrderResponder } from "./fixtures/responder";

type Endpoint = {
    endpointId: string;
    method?: string;
    access?: string;
    output?: Array<{ status?: string; body?: DataShape }>;
};

installCommerceTestEnvironment();

describe("commerce order strict Source contracts", () => {
    test("preserves all six exact Source projections consumed by integrations", async () => {
        useCompleteOrderResponder();
        const endpoints = await sourceEndpoints();
        const cases = [
            ["myOrders", "/me/orders?limit=2&offset=2", { userId: buyerId }, expectedBuyerSourceList],
            ["myOrder", "/me/order?id=42", { userId: buyerId }, expectedBuyerSourceDetail],
            ["mySales", "/me/sales?limit=2&offset=2", { userId: sellerUserId }, expectedSellerSourceList],
            ["mySale", "/me/sale?id=42", { userId: sellerUserId }, expectedSellerSourceDetail],
            ["orders", "/admin/orders?limit=2&offset=2", {}, expectedAdminSourceList],
            ["order", "/admin/order?id=42", {}, expectedAdminSourceDetail],
        ] as const;

        for (const [endpointId, path, options, expected] of cases) {
            const response = await requestCommerce(path, options);
            expect({ endpointId, status: response.status }).toEqual({ endpointId, status: 200 });
            expect(
                projectStrictDataShape(await response.json(), responseBody(endpoints, endpointId), "response", {
                    enforceRequired: false,
                }),
            ).toEqual(expected);
        }
    });

    test("keeps the current methods and access declarations explicit", async () => {
        const endpoints = await sourceEndpoints();
        const actual = ["myOrders", "myOrder", "mySales", "mySale", "orders", "order"].map((endpointId) => {
            const endpoint = endpoints.find((candidate) => candidate.endpointId === endpointId);
            return { endpointId, method: endpoint?.method, access: endpoint?.access ?? null };
        });

        expect(actual).toEqual([
            { endpointId: "myOrders", method: "GET", access: "auth" },
            { endpointId: "myOrder", method: "GET", access: "auth" },
            { endpointId: "mySales", method: "GET", access: "auth" },
            { endpointId: "mySale", method: "GET", access: "auth" },
            { endpointId: "orders", method: "GET", access: null },
            { endpointId: "order", method: "GET", access: null },
        ]);
    });
});

const definitionPath = resolve(
    import.meta.dir,
    "../../../../integrations/domains/commerce/versions/1.0.0/definition.json",
);

async function sourceEndpoints(): Promise<Endpoint[]> {
    const definition = await loadIntegrationDefinition<any>(definitionPath);
    return definition.artifacts.find((artifact: any) => artifact.source).source.endpoints;
}

function responseBody(endpoints: Endpoint[], endpointId: string): DataShape {
    const body = endpoints
        .find((endpoint) => endpoint.endpointId === endpointId)
        ?.output?.find((output) => output.status === "200")?.body;
    if (!body) {
        throw new Error(`Missing 200 response contract for ${endpointId}`);
    }
    return body;
}
