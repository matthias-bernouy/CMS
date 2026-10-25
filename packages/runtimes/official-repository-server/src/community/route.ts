import type { AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import type { GatewayRoute } from "@bernouy/cms-gateway";

/** Explicit process-local installation: the runtime pins its own admitted implementation. */
export async function repositoryRoute(contract: AdmittedContractRelease): Promise<() => GatewayRoute> {
    const catalogue = new InMemoryReleaseCatalogue();
    const release = await catalogue.publish(contract);
    const origin = "http://127.0.0.1";
    const pin = { contractId: contract.release.contractId, version: contract.release.version, digest: contract.digest };
    const admission = await admitProviderManifest(
        {
            kind: "provider-manifest",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            providerId: "ulvia.repository",
            name: "Community Repository",
            version: "0.1.0",
            provenance: { publisherId: "ulvia.official", publishedAt: "2026-10-25T00:00:00.000Z" },
            buildVersionRange: ">=0.1.0 <1.0.0",
            endpoint: { allowedOrigins: [origin] },
            configuration: { type: "object", properties: {}, required: [] },
            credentialSlots: [],
            implementations: [{ ...pin, requires: [] }],
        },
        catalogue,
    );
    return () => {
        const now = new Date().toISOString();
        return {
            selection: { siteId: "repository", ...pin, installationId: "repository-local" },
            release,
            requestedRelease: release,
            lineage: [
                {
                    ...pin,
                    name: contract.release.name,
                    capabilityIds: contract.release.capabilities.map((item) => item.id),
                },
            ],
            manifest: { admission, publishedAt: now },
            installation: {
                revision: 1,
                installation: {
                    id: "repository-local",
                    siteId: "repository",
                    providerId: "ulvia.repository",
                    accountId: "repository",
                    endpoint: origin,
                    status: "enabled",
                    providerTokenRef: "${REPOSITORY_LOCAL}",
                    configuration: {},
                    approval: {
                        manifestVersion: admission.manifest.version,
                        manifestDigest: admission.digest,
                        approvedAt: now,
                        approvedBy: "repository-runtime",
                    },
                    createdAt: now,
                    updatedAt: now,
                },
                observation: {
                    observedAt: now,
                    report: {
                        protocol: "ulvia-provider/v1",
                        providerId: "ulvia.repository",
                        instanceId: "repository",
                        account: { id: "repository", label: "Repository" },
                        buildVersion: "0.1.0",
                        manifest: { version: admission.manifest.version, digest: admission.digest },
                        implementations: [{ ...pin, status: "ready" }],
                    },
                },
            },
        };
    };
}
