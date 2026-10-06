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
                behavior: { effect: "query", execution: "sync" },
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

test("the Core relay decodes percent-encoded string query parameters exactly once", async () => {
    const release = {
        contractId: "ulvia.cms.files",
        capabilities: [
            {
                id: "list",
                behavior: { effect: "query", execution: "sync" },
                input: {
                    type: "object",
                    properties: { parentId: { type: "string", maxLength: 96 } },
                    required: [],
                },
                output: { type: "null" },
                binding: {
                    transport: "http",
                    method: "GET",
                    path: "/v1/files",
                    input: { query: { parentId: "parentId" } },
                    response: { successStatuses: [204], contentTypes: [], errorStatuses: {} },
                },
            },
        ],
    } as never;
    const relay = createCoreContractRelay([release], {
        invoke: async (_contractId, _capabilityId, input) => {
            expect(input).toEqual({ parentId: "" });
            return null;
        },
    });
    const parentId = encodeURIComponent(JSON.stringify(""));

    const response = await relay(
        new Request(`http://provider.test/v1/files?parentId=${parentId}`, { headers: trustedHeaders() }),
    );

    expect(response?.status).toBe(204);
});

test("the Core relay returns the protocol operation handle without validating it as terminal output", async () => {
    const release = {
        contractId: "ulvia.cms.jobs",
        capabilities: [
            {
                id: "start",
                behavior: { effect: "command", execution: "operation", idempotency: "keyed" },
                input: { type: "object", properties: {}, required: [] },
                output: { type: "object", properties: { done: { type: "boolean" } }, required: ["done"] },
                binding: {
                    transport: "http",
                    method: "POST",
                    path: "/v1/jobs",
                    input: { body: true },
                    response: { successStatuses: [202], contentTypes: ["application/json"], errorStatuses: {} },
                },
            },
        ],
    } as never;
    const relay = createCoreContractRelay([release], {
        invoke: async () => ({ operationId: "00000000-0000-4000-8000-000000000010" }),
    });
    const response = await relay(
        new Request("http://provider.test/v1/jobs", {
            method: "POST",
            headers: { ...trustedHeaders(), "content-type": "application/json", "idempotency-key": "job-1" },
            body: "{}",
        }),
    );
    expect(response?.status).toBe(202);
    expect(await response?.json()).toEqual({ operationId: "00000000-0000-4000-8000-000000000010" });
});

test("the Core relay requires keys exactly for keyed commands", async () => {
    const release = {
        contractId: "ulvia.cms.jobs",
        capabilities: [
            {
                id: "start",
                behavior: { effect: "command", execution: "operation", idempotency: "keyed" },
                input: { type: "object", properties: {}, required: [] },
                output: { type: "null" },
                binding: {
                    transport: "http",
                    method: "POST",
                    path: "/v1/jobs",
                    input: { body: true },
                    response: { successStatuses: [202], contentTypes: ["application/json"], errorStatuses: {} },
                },
            },
        ],
    } as never;
    let invoked = 0;
    const relay = createCoreContractRelay([release], {
        invoke: async () => {
            invoked += 1;
            return { operationId: "00000000-0000-4000-8000-000000000010" };
        },
    });
    const response = await relay(
        new Request("http://provider.test/v1/jobs", {
            method: "POST",
            headers: { ...trustedHeaders(), "content-type": "application/json" },
            body: "{}",
        }),
    );
    expect(response?.status).toBe(400);
    expect(invoked).toBe(0);
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
