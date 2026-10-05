import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { CapabilityGateway, type GatewayRoute } from "@bernouy/cms-gateway";
import {
    DefaultCollectionPageExecutionAuthority,
    InMemoryCollectionPageExecutionGrantStore,
} from "@bernouy/cms-gateway/execution";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { type CatalogueContractRelease, InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifestJson } from "@bernouy/cms-repository/providers";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { StoredContractSelections } from "@bernouy/cms-repository/providers/selections";
import { createOfficialProviderHandler, OfficialCmsInstanceDiscovery } from "@bernouy/ulvia-official-provider";
import { FileInstanceRegistry, FileSubmissionStore } from "@bernouy/ulvia-official-provider/local-fs";

const NOW = "2026-10-05T10:00:00.000Z";
const CONTRACT_ID = "ulvia.provider.cms-instances";
const resourceRoot = resolve(import.meta.dir, "../../../official-repository");

test("provider instance discovery follows the admitted plan and opaque credential path", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-provider-lifecycle-"));
    try {
        const releases = new InMemoryReleaseCatalogue();
        for (const id of ["catalog.items", "forms.submissions", "media.assets", "ulvia.cms.pages", CONTRACT_ID]) {
            await releases.publish(
                await admitContractReleaseJson(await readFile(join(resourceRoot, "contracts", id, "definition.json"))),
            );
        }
        const manifestAdmission = await admitProviderManifestJson(
            await readFile(join(resourceRoot, "providers", "ulvia.official", "definition.json")),
            releases,
        );
        const lifecycle = (await releases.get(CONTRACT_ID, "1.0.0"))!;
        const report = {
            protocol: "ulvia-provider/v1" as const,
            providerId: "ulvia.official",
            account: { id: "local-dev", label: "Ulvia local provider" },
            buildVersion: manifestAdmission.manifest.version,
            manifest: { version: manifestAdmission.manifest.version, digest: manifestAdmission.digest },
            implementations: manifestAdmission.manifest.implementations.map((item) => ({
                contractId: item.contractId,
                version: item.version,
                digest: item.digest,
                status: "ready" as const,
            })),
        };
        const instances = new OfficialCmsInstanceDiscovery(
            new FileInstanceRegistry(join(root, "instances.json")),
            "default",
            async () => true,
            () => new Date(NOW),
        );
        await instances.registerCurrent({
            id: "default",
            label: "Local CMS",
            lifecycleState: "running",
            coreVersion: "0.1.0",
            contracts: [],
            healthUrl: "http://127.0.0.1:5100/",
        });
        const token = "opaque-provider-token-with-private-instance-routing";
        const handler = createOfficialProviderHandler({
            token,
            report,
            contracts: {
                catalog: (await releases.get("catalog.items", "0.1.1"))!.admission.release,
                forms: (await releases.get("forms.submissions", "0.1.1"))!.admission.release,
                instances: lifecycle.admission.release,
                media: (await releases.get("media.assets", "0.2.0"))!.admission.release,
                pages: (await releases.get("ulvia.cms.pages", "1.0.0"))!.admission.release,
            },
            core: { invoke: async () => ({ items: [] }) },
            instances,
            submissions: new FileSubmissionStore(join(root, "submissions")),
        });
        const route = gatewayRoute(lifecycle, manifestAdmission, report);
        const stored = storedSelections(route);
        const routes = { resolve: async () => route, isCurrent: async () => true };
        const authority = new DefaultCollectionPageExecutionAuthority(
            { get: async () => stored },
            routes,
            new InMemoryCollectionPageExecutionGrantStore(),
        );
        const consumer = {
            siteId: "default",
            publisherId: "ulvia.official",
            collectionId: "ulvia.control",
            collectionVersion: "1.0.0",
            collectionDigest: `sha256:${"c".repeat(64)}`,
            pageId: "instances",
            pageGeneration: 1,
        } as const;
        const grant = await authority.activate({
            consumer,
            requirements: [{ contractId: CONTRACT_ID, capabilityId: "get-current", versionRange: "^1.0.0" }],
        });
        const execution = await authority.authorize({
            ...consumer,
            contractId: CONTRACT_ID,
            capabilityId: "get-current",
        });
        await expect(
            authority.authorize({ ...consumer, contractId: CONTRACT_ID, capabilityId: "list" }),
        ).rejects.toMatchObject({ code: "not_authorized" });
        const invoker = new CapabilityGateway({
            routes,
            now: () => NOW,
            authorize: async () => true,
            transport: new HttpGatewayTransport({
                network: {
                    exchange: async (request) => {
                        expect(request.providerTokenRef).toBe("${PROVIDER_TOKEN}");
                        return handler(
                            new Request(`${request.origin}${request.pathAndQuery}`, {
                                method: request.method,
                                headers: { ...request.headers, authorization: `Bearer ${token}` },
                                body: request.body,
                            }),
                        );
                    },
                },
            }),
        });
        const result = await invoker.invoke({
            siteId: "default",
            contractId: CONTRACT_ID,
            capabilityId: "get-current",
            input: {},
            origin: "page",
            actor: { kind: "administrator", subjectId: "admin" },
            execution,
        });

        expect(result).toMatchObject({ kind: "success", output: { id: "default", availability: "ready" } });
        expect(JSON.stringify(grant.plan)).not.toMatch(/providerTokenRef|healthUrl|instanceId/u);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

function gatewayRoute(
    release: CatalogueContractRelease,
    manifest: Awaited<ReturnType<typeof admitProviderManifestJson>>,
    report: ProviderRuntimeReport,
): GatewayRoute {
    const selection = {
        siteId: "default",
        contractId: CONTRACT_ID,
        version: "1.0.0",
        digest: release.admission.digest,
        installationId: "local-provider",
    } as const;
    return {
        selection,
        release,
        manifest: { admission: manifest, publishedAt: NOW },
        installation: {
            revision: 1,
            installation: {
                id: "local-provider",
                siteId: "default",
                providerId: "ulvia.official",
                accountId: "local-dev",
                endpoint: "http://127.0.0.1:5103",
                status: "enabled",
                approval: {
                    manifestVersion: manifest.manifest.version,
                    manifestDigest: manifest.digest,
                    approvedAt: NOW,
                    approvedBy: "admin",
                },
                providerTokenRef: "${PROVIDER_TOKEN}",
                configuration: {},
                createdAt: NOW,
                updatedAt: NOW,
            },
            observation: { observedAt: NOW, report },
        },
    };
}

function storedSelections(route: GatewayRoute): StoredContractSelections {
    return {
        siteId: "default",
        revision: 1,
        dependencyRevision: "dependencies-1",
        plan: {
            siteId: "default",
            selections: [route.selection],
            dependencies: [],
            structurallyValid: true,
            runtimeReadiness: "not-evaluated",
        },
    };
}
