import { admitContractRelease } from "@bernouy/cms-repository/contracts";

export function queryContract() {
    return admitContractRelease({
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId: "shop",
        version: "2.3.0",
        name: "Shop",
        publisherId: "ulvia.official",
        capabilities: [
            {
                id: "list-products",
                access: "public",
                behavior: { effect: "query", execution: "sync" },
                input: { type: "object", properties: { category: { type: "string", maxLength: 50 } }, required: [] },
                output: { type: "object", properties: {}, required: [] },
                errors: [],
                bindings: [
                    {
                        id: "http",
                        transport: "http",
                        method: "QUERY",
                        path: "/products",
                        input: { body: true },
                        response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                    },
                ],
            },
        ],
    });
}
