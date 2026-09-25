import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";

export function contractDocument(contractId: string, capabilityId: string, version = "1.0.0"): Record<string, unknown> {
    return {
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId,
        name: contractId,
        version,
        publisherId: "ulvia.official",
        capabilities: [
            {
                id: capabilityId,
                access: "admin",
                behavior: { effect: "command", idempotency: "keyed", execution: "sync" },
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
                binding: {
                    transport: "http",
                    method: "POST",
                    path: `/v1/${contractId.replaceAll(".", "/")}`,
                    input: { body: true },
                    response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                },
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

export function manifestDocument(
    implementations: readonly Record<string, unknown>[],
    overrides: Record<string, unknown> = {},
): Record<string, unknown> {
    return {
        kind: "provider-manifest",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        providerId: "ulvia.example",
        name: "Ulvia Example Provider",
        version: "1.0.0",
        provenance: { publisherId: "ulvia.official", publishedAt: "2026-09-22T00:00:00Z" },
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
    return { contractId, version, digest, requires };
}

export function requirement(
    contractId: string,
    capabilityId: string,
    versionRange = "^1.0.0",
): Record<string, unknown> {
    return { contractId, capabilityId, versionRange, optional: false };
}
