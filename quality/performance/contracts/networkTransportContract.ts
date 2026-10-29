import type { GatewayRoute } from "@bernouy/cms-gateway";
import { admitContractReleaseJson, type AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";

export const NETWORK_TOKEN = "performance-provider-token-that-is-long-enough";
export const NETWORK_INSTANCE_ID = "instance:performance";
export const NETWORK_SITE_ID = "performance";

export async function performanceContract(): Promise<AdmittedContractRelease> {
    return admitContractReleaseJson(
        JSON.stringify({
            kind: "contract",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            contractId: "ulvia.cms.performance",
            name: "Performance echo",
            description: "Real transport performance fixture.",
            version: "1.0.0",
            publisherId: "ulvia.performance",
            capabilities: [
                {
                    id: "echo",

                    access: "public",
                    behavior: { sensitive: false, effect: "query", execution: "sync" },
                    input: {
                        type: "object",
                        properties: { value: { type: "string", maxLength: 64 } },
                        required: ["value"],
                    },
                    output: {
                        type: "object",
                        properties: { value: { type: "string", maxLength: 64 } },
                        required: ["value"],
                    },
                    errors: [],
                    bindings: [
                        {
                            id: "http",
                            transport: "http",
                            method: "QUERY",
                            path: "/v1/performance/echo",
                            input: { body: true },
                            response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                        },
                    ],
                },
            ],
        }),
    );
}

export async function performanceRoute(admission: AdmittedContractRelease, endpoint: string): Promise<GatewayRoute> {
    const releases = new InMemoryReleaseCatalogue();
    const release = await releases.publish(admission);
    const manifestAdmission = await admitProviderManifest(
        {
            requires: [],
            kind: "provider-manifest",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            providerId: "ulvia.performance",
            name: "Performance Provider",
            version: "1.0.0",
            provenance: { publisherId: "ulvia.performance", publishedAt: "2026-10-15T00:00:00Z" },
            buildVersionRange: ">=1.0.0 <2.0.0",
            endpoint: { allowedOrigins: [endpoint], defaultOrigin: endpoint },
            configuration: { type: "object", properties: {}, required: [] },
            credentialSlots: [{ id: "provider-token", label: "Provider token", required: true, secretType: "token" }],
            implementations: [
                {
                    contractId: admission.release.contractId,
                    version: admission.release.version,
                    digest: admission.digest,
                    requires: [],
                },
            ],
        },
        releases,
    );
    const timestamp = "2026-10-15T11:59:00.000Z";
    const report = runtimeReport(admission, manifestAdmission.digest);
    return {
        selection: {
            siteId: NETWORK_SITE_ID,
            contractId: admission.release.contractId,
            version: admission.release.version,
            digest: admission.digest,
            installationId: "performance-provider",
        },
        release,
        requestedRelease: release,
        lineage: [
            {
                contractId: admission.release.contractId,
                version: admission.release.version,
                digest: admission.digest,
                name: admission.release.name,
                capabilityIds: admission.release.capabilities.map(({ id }) => id),
            },
        ],
        manifest: { admission: manifestAdmission, publishedAt: timestamp },
        installation: {
            revision: 1,
            installation: {
                id: "performance-provider",
                siteId: NETWORK_SITE_ID,
                providerId: "ulvia.performance",
                accountId: "local",
                endpoint,
                status: "enabled",
                approval: {
                    manifestVersion: manifestAdmission.manifest.version,
                    manifestDigest: manifestAdmission.digest,
                    approvedAt: timestamp,
                    approvedBy: "performance-suite",
                },
                providerTokenRef: "performance-token-ref",
                configuration: {},
                createdAt: timestamp,
                updatedAt: timestamp,
            },
            observation: { observedAt: timestamp, report },
        },
    };
}

export function runtimeReport(admission: AdmittedContractRelease, manifestDigest: `sha256:${string}`) {
    return {
        protocol: "ulvia-provider/v1" as const,
        providerId: "ulvia.performance",
        instanceId: NETWORK_INSTANCE_ID,
        account: { id: "local", label: "Performance Provider" },
        buildVersion: "1.0.0",
        manifest: { version: "1.0.0", digest: manifestDigest as never },
        implementations: [
            {
                contractId: admission.release.contractId,
                version: admission.release.version,
                digest: admission.digest,
                status: "ready" as const,
            },
        ],
    };
}
