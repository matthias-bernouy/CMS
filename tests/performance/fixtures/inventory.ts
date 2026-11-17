import { admitContractRelease, resolveContract } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { inventoryFromBuilds } from "../capabilities/inventory";
import { budgetFor } from "../capabilities/policies";
import type { CapabilityDefinition, ContractRelease } from "@bernouy/ulvia-contracts";
import type { Measurement, ScenarioDefinition } from "../capabilities/types";

export function capability(id = "read"): CapabilityDefinition {
    return {
        id,
        access: "public",
        behavior: { effect: "query", execution: "sync", sensitive: false },
        input: { type: "object", properties: {}, required: [] },
        output: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
        errors: [],
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "GET",
                path: `/${id}`,
                response: { contentTypes: ["application/json"], successStatuses: [200], errorStatuses: {} },
            },
            { id: "mcp", transport: "mcp" },
        ],
    };
}

function definition(id: string, capabilities: readonly CapabilityDefinition[]): ContractRelease {
    return {
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: "performance",
        contractId: `performance/${id}`,
        name: id,
        version: "1.0.0",
        capabilities,
    };
}

export async function inventoryFixture() {
    const catalogue = new InMemoryReleaseCatalogue();
    const parent = await admitContractRelease(definition("parent", [capability("inherited")]));
    await catalogue.publish(parent);
    const child = await admitContractRelease({
        ...definition("child", [capability()]),
        extends: { contractId: parent.release.contractId, version: parent.release.version, digest: parent.digest },
    });
    const template = await admitContractRelease(definition("template", [capability("unimplemented")]));
    const build = {
        contracts: [parent, child, template],
        implementations: [
            {
                contractId: child.release.contractId,
                version: child.release.version,
                digest: child.digest,
                requires: [],
            },
        ],
        implementedContracts: [await resolveContract(catalogue, child)],
    };
    const inventory = inventoryFromBuilds(build);
    const target = inventory.targets.find((entry) => entry.definition.id === "read")!;
    const obligation = { target: target.key, binding: "http", variant: "nominal" } as const;
    const scenario: ScenarioDefinition = {
        id: "fixture.read",
        version: 1,
        fixture: "fixture-sha256",
        obligations: [obligation],
        budget: budgetFor(target, "nominal"),
        samples: 1,
    };
    const measurement: Measurement = {
        scenario: scenario.id,
        phase: "measurement",
        obligation,
        traceId: "trace-a",
        durationMs: 10,
        requestBytes: 0,
        responseBytes: 11,
        status: 200,
        validated: true,
        completed: true,
        streamConsumed: true,
        work: {
            mongoOperations: 2,
            documentsExamined: 1,
            keysExamined: 1,
            documentsReturned: 1,
            internalRequests: 1,
            internalResponseBytes: 11,
            instrumentationComplete: true,
        },
        invocations: [{ target: target.key, binding: "http", traceId: "trace-a", durationMs: 2, success: true }],
    };
    return { build, inventory, target, scenario, measurement };
}
