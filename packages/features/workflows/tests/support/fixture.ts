import { MemoryWorkflowInstallations } from "./installations";
import { WorkflowDefinitions, WorkflowRuns, WorkflowRunner, WorkflowError } from "@bernouy/workflows";
import type { WorkflowServices, WorkflowDefinition, WorkflowCapability } from "@bernouy/workflows";
import { MemoryWorkflowStore } from "./store";
export const definition: WorkflowDefinition = {
    format: "ulvia-workflow/v1",
    parametersSchema: { type: "object", properties: {}, required: [] },
    inputSchema: {
        type: "object",
        properties: { id: { type: "string", minLength: 1, maxLength: 32 } },
        required: ["id"],
    },
    outputSchema: { type: "boolean" },
    entry: "read",
    steps: [
        {
            id: "read",
            kind: "call",
            target: { contractId: "test/orders", capabilityId: "orders.read" },
            input: { kind: "input", path: "" },
            next: "large",
            onError: {},
        },
        {
            id: "large",
            kind: "condition",
            test: {
                kind: "compare",
                operator: "gt",
                left: { kind: "step", stepId: "read", path: "/total" },
                right: { kind: "literal", value: 100 },
            },
            then: "notify",
            otherwise: null,
        },
        {
            id: "notify",
            kind: "call",
            target: { contractId: "test/orders", capabilityId: "orders.notify" },
            input: { kind: "object", fields: { email: { kind: "step", stepId: "read", path: "/email" } } },
            next: null,
            onError: {},
        },
    ],
    output: { kind: "literal", value: true },
};
export function fixture() {
    const store = new MemoryWorkflowStore();
    let now = Date.parse("2026-11-23T10:00:00Z");
    let allowed = true;
    const capabilities: Record<string, WorkflowCapability> = {
        "orders.read": {
            target: target("orders.read"),
            operationReadable: true,
            capability: {
                id: "orders.read",
                access: "admin",
                behavior: { effect: "query", execution: "sync", sensitive: false },
                bindings: [],
                input: definition.inputSchema,
                output: {
                    type: "object",
                    properties: {
                        email: { type: "string", format: "email", maxLength: 128 },
                        total: { type: "integer", minimum: 0, maximum: 10000 },
                    },
                    required: ["email", "total"],
                },
                errors: [],
            },
        },
        "orders.notify": {
            target: target("orders.notify"),
            operationReadable: true,
            capability: {
                id: "orders.notify",
                access: "admin",
                behavior: { effect: "command", execution: "sync", idempotency: "keyed", sensitive: false },
                bindings: [],
                input: {
                    type: "object",
                    properties: { email: { type: "string", format: "email", maxLength: 128 } },
                    required: ["email"],
                },
                output: { type: "boolean" },
                errors: [],
            },
        },
    };
    const calls: { id: string; key?: string }[] = [];
    const services: WorkflowServices = {
        store,
        values: store,
        artifacts: {
            read: async () => {
                throw new WorkflowError("NOT_FOUND");
            },
        },
        installationStore: new MemoryWorkflowInstallations(),
        now: () => now,
        contracts: { resolve: async (_contract, capability) => structuredClone(capabilities[capability]!) },
        authority: {
            callAncestry: async () => [],
            administrator: async () => {
                if (!allowed) {
                    throw new WorkflowError("FORBIDDEN");
                }
                return "admin";
            },
            assertAdministrator: async () => {
                if (!allowed) {
                    throw new WorkflowError("FORBIDDEN");
                }
            },
            assertEventDelivery: async (context) => {
                if (context.systemServiceId !== "cms-events-delivery" || context.siteId !== "site-a") {
                    throw new Error("Forbidden");
                }
            },
        },
        domainSubscriptions: {
            disable: async () => ({ revision: 2 }),
            ensure: async (_id, _config, revision) => ({ revision: revision + 1 }),
            remove: async () => {},
        },
        execution: {
            invoke: async (capability, _input, _administrator, key) => {
                calls.push({ id: capability.capability.id, ...(key ? { key } : {}) });
                return {
                    kind: "success",
                    requestId: "request",
                    output:
                        capability.capability.id === "orders.read"
                            ? { email: "customer@example.test", total: 200 }
                            : true,
                };
            },
            operation: async () => ({ state: "waiting" }),
        },
    };
    return {
        store,
        services,
        capabilities,
        calls,
        definitions: new WorkflowDefinitions(services),
        runs: new WorkflowRuns(services),
        runner: () => new WorkflowRunner(services, { leaseMs: 30000, retryMs: 1, maxAttempts: 3 }),
        advance: (value = 2) => {
            now += value;
        },
        revoke: () => {
            allowed = false;
        },
        allow: () => {
            allowed = true;
        },
    };
}
function target(capabilityId: string) {
    return {
        installationId: "provider",
        contractId: "test/orders",
        version: "1.0.0",
        digest: `sha256:${"a".repeat(64)}`,
        capabilityId,
        endpoint: "https://provider.test",
        accountId: "account",
        instanceId: "instance",
    };
}
