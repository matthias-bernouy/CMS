import { resourceName } from "@bernouy/resource-identity";
import { admitContractRelease } from "@bernouy/ulvia-contracts";
import { InMemoryReleaseCatalogue } from "cms-repository/contracts/default-implementation/memory/InMemoryReleaseCatalogue";

export function contractDocument(contractId: string, capabilityId: string, version = "1.0.0"): Record<string, unknown> {
    return {
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId: contractId.includes("/") ? contractId : `ulvia/${contractId}`,
        name: contractId,
        version,
        publisherId: "ulvia",
        capabilities: [
            {
                id: capabilityId,

                access: "admin",
                behavior: { sensitive: false, effect: "command", idempotency: "keyed", execution: "sync" },
                input: {
                    type: "object",
                    properties: { value: { type: "string", maxLength: 128 } },
                    required: ["value"],
                },
                output: {
                    type: "object",
                    properties: { id: { type: "string", maxLength: 128 } },
                    required: ["id"],
                },
                errors: [],
                bindings: [
                    {
                        id: "http",
                        transport: "http",
                        method: "POST",
                        path: `/v1/${(contractId.includes("/") ? resourceName(contractId) : contractId).replaceAll(".", "/")}`,
                        input: { body: true },
                        response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                    },
                ],
            },
        ],
    };
}

export async function releaseCatalogue(...documents: Record<string, unknown>[]): Promise<InMemoryReleaseCatalogue> {
    const catalogue = new InMemoryReleaseCatalogue();
    for (const document of documents) {
        await catalogue.publish(await admitContractRelease(document));
    }
    return catalogue;
}

/** A replacement is introduced and deprecated before a major removes the former capability. */
export function capabilityTransition(
    contractId: string,
    previousId: string,
    nextId: string,
): Record<string, unknown>[] {
    contractId = contractId.includes("/") ? contractId : `ulvia/${contractId}`;
    const next = contractDocument(contractId, nextId, "2.0.0");
    const replacement = (next.capabilities as Record<string, unknown>[])[0]!;
    (replacement.bindings as Record<string, unknown>[])[0]!.path =
        `/v2/${(contractId.includes("/") ? resourceName(contractId) : contractId).replaceAll(".", "/")}`;
    const transition = contractDocument(contractId, previousId, "1.1.0");
    const previous = (transition.capabilities as Record<string, unknown>[])[0]!;
    previous.deprecation = { replacedBy: nextId };
    (transition.capabilities as Record<string, unknown>[]).push(structuredClone(replacement));
    return [transition, next];
}

export function manifestDocument(
    implementations: readonly Record<string, unknown>[],
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        requires: [],
        kind: "provider-manifest",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        providerId: "ulvia/ulvia.example",
        name: "Ulvia Example Provider",
        version: "1.0.0",
        provenance: { publisherId: "ulvia", publishedAt: "2026-09-22T00:00:00Z" },
        buildVersionRange: ">=1.0.0 <2.0.0",
        endpoint: {
            allowedOrigins: ["https://provider.example.com"],
            defaultOrigin: "https://provider.example.com",
        },
        configuration: { type: "object", properties: {}, required: [] },
        credentialSlots: [],
        implementations,
        dataPolicy: { residency: ["eu"] },
        ...overrides,
    };
}

export function implementation(
    contractId: string,
    version: string,
    digest: string,
    requires: readonly Record<string, unknown>[] = [],
): Record<string, unknown> {
    return { contractId: contractId.includes("/") ? contractId : `ulvia/${contractId}`, version, digest, requires };
}

export function requirement(
    contractId: string,
    capabilityId: string,
    versionRange = "^1.0.0",
): Record<string, unknown> {
    return {
        contractId: contractId.includes("/") ? contractId : `ulvia/${contractId}`,
        capabilityId,
        versionRange,
        optional: false,
    };
}
