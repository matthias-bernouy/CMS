import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import type { GatewayRoute } from "@bernouy/cms-gateway";

export const NOW = "2026-09-29T08:00:00.000Z";

export async function gatewayRoute(
    overrides: { access?: string; behavior?: Record<string, unknown>; binary?: boolean; media?: boolean } = {},
): Promise<GatewayRoute> {
    const command = overrides.behavior?.effect === "command";
    const contract = await admitContractRelease({
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId: "catalog",
        name: "Catalog",
        version: "1.0.0",
        publisherId: "ulvia.official",
        capabilities: [
            {
                id: "item.list",
                access: overrides.access ?? "public",
                behavior: overrides.behavior ?? { effect: "query", execution: "sync" },
                input: overrides.binary
                    ? {
                          type: "object",
                          properties: { fileId: { type: "string", maxLength: 256 } },
                          required: ["fileId"],
                      }
                    : { type: "object", properties: { term: { type: "string", maxLength: 50 } }, required: [] },
                output: overrides.binary
                    ? { type: "binary", maxBytes: 8, mediaTypes: ["image/png"] }
                    : {
                          type: "object",
                          properties: {
                              items: { type: "array", items: { type: "string", maxLength: 50 }, maxItems: 10 },
                          },
                          required: ["items"],
                      },
                errors: [{ code: "NOT_FOUND", retryable: false }],
                ...(overrides.binary && overrides.media !== false ? { media: { idInput: "fileId" } } : {}),
                binding: {
                    transport: "http",
                    method: command ? "POST" : "GET",
                    path: overrides.binary ? "/v1/files/{fileId}" : "/v1/items",
                    input: overrides.binary
                        ? { path: { fileId: "fileId" } }
                        : command
                          ? { body: true }
                          : { query: { term: "term" } },
                    response: {
                        successStatuses: [overrides.behavior?.execution === "operation" ? 202 : 200],
                        contentTypes: [
                            overrides.behavior?.execution === "operation"
                                ? "application/json"
                                : overrides.binary
                                  ? "image/png"
                                  : "application/json",
                        ],
                        errorStatuses: { NOT_FOUND: 404 },
                    },
                },
            },
        ],
    });
    const releases = new InMemoryReleaseCatalogue();
    const release = await releases.publish(contract);
    const admittedManifest = await admitProviderManifest(
        {
            kind: "provider-manifest",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            providerId: "ulvia.example",
            name: "Example Provider",
            version: "1.0.0",
            provenance: { publisherId: "ulvia.official", publishedAt: NOW },
            buildVersionRange: ">=1.0.0 <2.0.0",
            endpoint: { allowedOrigins: ["https://provider.example.com"] },
            configuration: { type: "object", properties: {}, required: [] },
            credentialSlots: [],
            implementations: [{ contractId: "catalog", version: "1.0.0", digest: contract.digest, requires: [] }],
            dataPolicy: { residency: ["eu"] },
        },
        releases,
    );
    return {
        selection: {
            siteId: "site-a",
            contractId: "catalog",
            version: "1.0.0",
            digest: contract.digest,
            installationId: "install-a",
        },
        release,
        manifest: { admission: admittedManifest, publishedAt: NOW },
        installation: {
            revision: 2,
            installation: {
                id: "install-a",
                siteId: "site-a",
                providerId: "ulvia.example",
                accountId: "account-a",
                endpoint: "https://provider.example.com",
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
                    providerId: "ulvia.example",
                    account: { id: "account-a", label: "Account A" },
                    buildVersion: "1.0.0",
                    manifest: { version: "1.0.0", digest: admittedManifest.digest },
                    implementations: [
                        { contractId: "catalog", version: "1.0.0", digest: contract.digest, status: "ready" },
                    ],
                },
            },
        },
    };
}
