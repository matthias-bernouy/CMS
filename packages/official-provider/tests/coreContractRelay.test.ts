import { expect, test } from "bun:test";
import { createCoreContractRelay } from "../src/http/coreContractRelay";

test("the Core relay rejects overlapping routes across contract releases", () => {
    const release = (contractId: string, path: string) =>
        ({
            contractId,
            capabilities: [
                {
                    id: "get",
                    input: { type: "object", properties: {}, required: [], additionalProperties: false },
                    output: { type: "null" },
                    binding: {
                        transport: "http",
                        method: "GET",
                        path,
                        response: { successStatuses: [204], contentTypes: [], errorStatuses: {} },
                    },
                },
            ],
        }) as never;

    expect(() =>
        createCoreContractRelay(
            [release("ulvia.cms.first", "/v1/items/{id}"), release("ulvia.cms.second", "/v1/items/fixed")],
            { invoke: async () => null },
        ),
    ).toThrow("routes overlap");
});

test("the Core relay preserves declared bodyless success responses", async () => {
    const release = {
        contractId: "ulvia.cms.health",
        capabilities: [
            {
                id: "probe",
                input: { type: "object", properties: {}, required: [], additionalProperties: false },
                output: { type: "null" },
                binding: {
                    transport: "http",
                    method: "GET",
                    path: "/v1/health",
                    response: { successStatuses: [204], contentTypes: [], errorStatuses: {} },
                },
            },
        ],
    } as never;
    const relay = createCoreContractRelay([release], { invoke: async () => null });

    const response = await relay(new Request("http://provider.test/v1/health", { headers: trustedHeaders() }));
    expect(response?.status).toBe(204);
    expect(await response?.text()).toBe("");
});

function trustedHeaders(): HeadersInit {
    return {
        "x-ulvia-request-id": "00000000-0000-4000-8000-000000000001",
        "x-ulvia-site-id": "default",
        "x-ulvia-installation-id": "official",
        "x-ulvia-origin": "control",
        "x-ulvia-actor-kind": "administrator",
        "x-ulvia-subject-id": "00000000-0000-4000-8000-000000000002",
    };
}
