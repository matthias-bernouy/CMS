import { admitProviderManifest } from "@bernouy/ulvia-providers";
import type { GatewayRoute } from "@bernouy/cms-gateway";
import type { CatalogueContractRelease, ContractReleaseReader } from "@bernouy/ulvia-contracts/catalogue";
export const NOW = "2026-09-29T08:00:00.000Z";
export async function contentRoute(
    release: CatalogueContractRelease,
    catalogue: ContractReleaseReader,
): Promise<GatewayRoute> {
    const contract = release.admission;
    const providerId = "ulvia/ulvia.example";
    const manifest = await admitProviderManifest(
        {
            kind: "provider-manifest",
            requires: [],
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            providerId,
            name: "Example Provider",
            version: "1.0.0",
            provenance: { publisherId: "ulvia", publishedAt: NOW },
            buildVersionRange: ">=1.0.0 <2.0.0",
            endpoint: { allowedOrigins: ["https://provider.example.com"] },
            configuration: { type: "object", properties: {}, required: [] },
            credentialSlots: [],
            implementations: [
                {
                    contractId: contract.release.contractId,
                    version: contract.release.version,
                    digest: contract.digest,
                    requires: [],
                },
            ],
        },
        catalogue,
    );
    return {
        selection: {
            siteId: "site-a",
            contractId: contract.release.contractId,
            version: contract.release.version,
            digest: contract.digest,
            installationId: "install-a",
        },
        release,
        requestedRelease: release,
        lineage: [
            {
                contractId: contract.release.contractId,
                version: contract.release.version,
                digest: contract.digest,
                name: contract.release.name,
                capabilityIds: contract.release.capabilities.map(({ id }) => id),
            },
        ],
        manifest: { admission: manifest, publishedAt: NOW },
        installation: {
            revision: 2,
            installation: {
                id: "install-a",
                siteId: "site-a",
                providerId,
                accountId: "account-a",
                endpoint: "https://provider.example.com",
                status: "enabled",
                approval: {
                    manifestVersion: "1.0.0",
                    manifestDigest: manifest.digest,
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
                    providerId,
                    instanceId: "instance:account-a",
                    account: { id: "account-a", label: "Account A" },
                    buildVersion: "1.0.0",
                    manifest: { version: "1.0.0", digest: manifest.digest },
                    implementations: [
                        {
                            contractId: contract.release.contractId,
                            version: contract.release.version,
                            digest: contract.digest,
                            status: "ready",
                        },
                    ],
                },
            },
        },
    };
}
