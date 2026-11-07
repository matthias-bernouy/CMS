import type { GatewayRoute } from "@bernouy/cms-gateway";
import type { CompiledProvider } from "@bernouy/ulvia-sdk";

/** An explicit test-only approved selection and fresh observation. */
export function observedRoute<Dependencies>(
    build: CompiledProvider<Dependencies>,
    origin: string,
    SITE: string,
    INSTANCE: string,
): GatewayRoute {
    const now = new Date().toISOString();
    const release = build.contracts.find((value) => value.release.contractId === "example/notes")!;
    const row = { admission: release, publishedAt: now };
    return {
        selection: {
            siteId: SITE,
            contractId: release.release.contractId,
            version: release.release.version,
            digest: release.digest,
            installationId: "install-notes",
        },
        release: row,
        requestedRelease: row,
        lineage: [
            {
                contractId: release.release.contractId,
                version: release.release.version,
                digest: release.digest,
                name: release.release.name,
                capabilityIds: release.release.capabilities.map((capability) => capability.id),
            },
        ],
        manifest: { admission: build.manifest, publishedAt: now },
        installation: {
            revision: 1,
            installation: {
                id: "install-notes",
                siteId: SITE,
                providerId: build.manifest.manifest.providerId,
                accountId: "account-notes",
                endpoint: origin,
                status: "enabled",
                approval: {
                    manifestVersion: build.manifest.manifest.version,
                    manifestDigest: build.manifest.digest,
                    approvedAt: now,
                    approvedBy: "admin",
                },
                providerTokenRef: "${EXAMPLE_PROVIDER_TOKEN}",
                configuration: {},
                createdAt: now,
                updatedAt: now,
            },
            observation: {
                observedAt: now,
                report: {
                    protocol: "ulvia-provider/v1",
                    providerId: build.manifest.manifest.providerId,
                    instanceId: INSTANCE,
                    account: { id: "account-notes", label: "Example" },
                    buildVersion: "1.0.0",
                    manifest: { version: build.manifest.manifest.version, digest: build.manifest.digest },
                    implementations: build.implementedContracts.map((contract) => ({
                        contractId: contract.release.contractId,
                        version: contract.release.version,
                        digest: contract.digest,
                        status: "ready",
                    })),
                },
            },
        },
    };
}
