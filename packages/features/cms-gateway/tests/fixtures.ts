import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import type { GatewayRoute } from "@bernouy/cms-gateway";

export const NOW = "2026-09-29T08:00:00.000Z";

export async function gatewayRoute(
    overrides: {
        endpoint?: string;
        contractId?: string;
        capabilityId?: string;
        providerId?: string;
        installationId?: string;
        delegation?: Record<string, unknown>;
        access?: string;
        behavior?: Record<string, unknown>;
        binary?: boolean;
        binaryInput?: boolean;
        rawRange?: boolean;
        mcp?: boolean;
        bindings?: readonly Record<string, unknown>[];
    } = {},
): Promise<GatewayRoute> {
    const command = overrides.binaryInput || overrides.behavior?.effect === "command";
    const definition = {
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId: overrides.contractId ?? "catalog",
        name: "Catalog",
        version: "1.0.0",
        publisherId: "ulvia.official",
        capabilities: [
            {
                id: overrides.capabilityId ?? "item.list",

                access: overrides.access ?? "public",
                behavior:
                    overrides.behavior ??
                    (overrides.binaryInput
                        ? { sensitive: false, effect: "command", execution: "sync", idempotency: "natural" }
                        : { sensitive: false, effect: "query", execution: "sync" }),
                input: overrides.binary
                    ? {
                          type: "object",
                          properties: {
                              fileId: { type: "string", maxLength: 256 },
                              ...(overrides.rawRange
                                  ? {
                                        range: { type: "string" as const, maxLength: 128 },
                                        ifRange: { type: "string" as const, maxLength: 160 },
                                    }
                                  : {}),
                          },
                          required: ["fileId"],
                      }
                    : overrides.binaryInput
                      ? {
                            type: "object",
                            properties: {
                                uploadId: { type: "string", maxLength: 256 },
                                bytes: { type: "binary", maxBytes: 8 },
                            },
                            required: ["uploadId", "bytes"],
                        }
                      : { type: "object", properties: { term: { type: "string", maxLength: 50 } }, required: [] },
                output: overrides.binary
                    ? { type: "binary", maxBytes: 8 }
                    : overrides.binaryInput
                      ? { type: "null" }
                      : {
                            type: "object",
                            properties: {
                                items: { type: "array", items: { type: "string", maxLength: 50 }, maxItems: 10 },
                            },
                            required: ["items"],
                        },
                errors: [{ code: "NOT_FOUND", retryable: false }],
                ...(overrides.mcp ? { bindings: [{ id: "mcp", transport: "mcp" as const }] } : {}),
                bindings: [
                    {
                        id: "http",
                        transport: "http",
                        method: overrides.binaryInput ? "PUT" : command ? "POST" : "GET",
                        path: overrides.binary
                            ? "/v1/files/{fileId}"
                            : overrides.binaryInput
                              ? "/v1/uploads/{uploadId}"
                              : "/v1/items",
                        input: overrides.binary
                            ? {
                                  path: { fileId: "fileId" },
                                  ...(overrides.rawRange
                                      ? {
                                            headers: {
                                                range: { property: "range", encoding: "http-field" as const },
                                                "if-range": { property: "ifRange", encoding: "http-field" as const },
                                            },
                                        }
                                      : {}),
                              }
                            : overrides.binaryInput
                              ? { path: { uploadId: "uploadId" }, body: { binaryProperty: "bytes" } }
                              : command
                                ? { body: true }
                                : { query: { term: "term" } },
                        response: {
                            successStatuses:
                                overrides.binary && overrides.rawRange
                                    ? [200, 206]
                                    : [
                                          overrides.binaryInput
                                              ? 204
                                              : overrides.behavior?.execution === "operation"
                                                ? 202
                                                : 200,
                                      ],
                            contentTypes:
                                overrides.binary || overrides.binaryInput
                                    ? []
                                    : [
                                          overrides.behavior?.execution === "operation"
                                              ? "application/json"
                                              : "application/json",
                                      ],
                            errorStatuses: { NOT_FOUND: 404 },
                        },
                    },
                ],
            },
        ],
    };
    if (overrides.mcp || overrides.bindings) {
        const capability = definition.capabilities[0]!;
        (capability as Record<string, unknown>).bindings = overrides.bindings ?? [
            { id: "http", ...capability.bindings[0] },
            { id: "mcp", transport: "mcp" },
        ];
        delete (capability as { binding?: unknown }).binding;
    }
    const contract = await admitContractRelease(definition);
    const releases = new InMemoryReleaseCatalogue();
    const release = await releases.publish(contract);
    const admittedManifest = await admitProviderManifest(
        {
            requires: [],
            kind: "provider-manifest",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            providerId: overrides.providerId ?? "ulvia.example",
            name: "Example Provider",
            version: "1.0.0",
            provenance: { publisherId: "ulvia.official", publishedAt: NOW },
            buildVersionRange: ">=1.0.0 <2.0.0",
            endpoint: { allowedOrigins: [overrides.endpoint ?? "https://provider.example.com"] },
            configuration: { type: "object", properties: {}, required: [] },
            credentialSlots: [],
            implementations: [
                {
                    contractId: overrides.contractId ?? "catalog",
                    version: "1.0.0",
                    digest: contract.digest,
                    requires: [],
                    ...(overrides.delegation ? { delegation: overrides.delegation } : {}),
                },
            ],
            dataPolicy: { residency: ["eu"] },
        },
        releases,
    );
    return {
        selection: {
            siteId: "site-a",
            contractId: overrides.contractId ?? "catalog",
            version: "1.0.0",
            digest: contract.digest,
            installationId: overrides.installationId ?? "install-a",
        },
        release,
        requestedRelease: release,
        lineage: [
            {
                contractId: contract.release.contractId,
                version: contract.release.version,
                digest: contract.digest,
                name: contract.release.name,
                capabilityIds: contract.release.capabilities.map((capability) => capability.id),
            },
        ],
        manifest: { admission: admittedManifest, publishedAt: NOW },
        installation: {
            revision: 2,
            installation: {
                id: overrides.installationId ?? "install-a",
                siteId: "site-a",
                providerId: overrides.providerId ?? "ulvia.example",
                accountId: "account-a",
                endpoint: overrides.endpoint ?? "https://provider.example.com",
                status: "enabled",
                approval: {
                    manifestVersion: "1.0.0",
                    manifestDigest: admittedManifest.digest,
                    approvedAt: NOW,
                    approvedBy: "admin-a",
                },
                providerTokenRef: "${PROVIDER_TOKEN}",
                configuration: {},
                createdAt: NOW,
                updatedAt: NOW,
            },
            observation: {
                observedAt: NOW,
                report: {
                    protocol: "ulvia-provider/v1",
                    providerId: overrides.providerId ?? "ulvia.example",
                    instanceId: "instance:account-a",
                    account: { id: "account-a", label: "Account A" },
                    buildVersion: "1.0.0",
                    manifest: { version: "1.0.0", digest: admittedManifest.digest },
                    implementations: [
                        {
                            contractId: overrides.contractId ?? "catalog",
                            version: "1.0.0",
                            digest: contract.digest,
                            status: "ready",
                        },
                    ],
                },
            },
        },
    };
}
