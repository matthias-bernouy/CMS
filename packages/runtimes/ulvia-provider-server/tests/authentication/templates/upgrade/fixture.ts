import { admitProviderManifest } from "@bernouy/ulvia-providers";
import { compileRetainedFeatures } from "@bernouy/ulvia-provider/build";
import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import { repositoryFixture } from "../../../provider-contracts/official/fixture";
import { SystemBootstrap } from "../../../../src/runtime/instances/system/execution/SystemBootstrap";
import { ProviderExecutionSupport } from "../../../../src/runtime/instances/system/execution/support";
import type { reviewSystemUpgrade } from "../../../../src/runtime/instances/system/execution/upgrades";
import previousManifest from "./primary-provider-1.9.0.json";

/** Exact pre-Templates manifest emitted at 7496cce8e; Access 1.0 is the retained admitted release. */
export async function previousInstance(control = false) {
    const resources = await repositoryFixture();
    const access = (await compileRetainedFeatures()).find(
        (build) => build.contracts[0]?.release.contractId === "ulvia/cms.access",
    )!;
    const previousAccess = access.contracts[0]!;
    const catalogue = {
        get: async (id: string, version: string) =>
            id === previousAccess.release.contractId && version === previousAccess.release.version
                ? { admission: previousAccess, publishedAt: "2026-11-20T00:00:00Z" }
                : resources.catalogue.get(id, version),
        list: (id: string) => resources.catalogue.list(id),
    };
    const admission = await admitProviderManifest(previousManifest, catalogue);
    const system = new SystemBootstrap(resources);
    const ordinary = await (control ? system.control() : system.current());
    const ids = new Set(ordinary.contracts.map(({ contractId }) => contractId));
    const pins = admission.manifest.implementations
        .filter(({ contractId }) => ids.has(contractId))
        .map(({ contractId, version, digest }) => ({ contractId, version, digest }));
    const instance: ProviderInstanceRecord = {
        id: "instance:previous",
        idempotencyKey: "previous",
        idempotencyFingerprint: "previous",
        creationAuthority: { kind: "operator" },
        storageKey: "previous",
        label: "Previous",
        cmsUrl: "https://previous.example",
        gatewayUrl: "http://edge:3000",
        status: "ready",
        revision: 1,
        repository: { url: "https://custom.example", configured: true },
        createdAt: "2026-11-20T00:00:00Z",
        updatedAt: "2026-11-20T00:00:00Z",
    };
    const coordinate = { version: admission.manifest.version, digest: admission.digest };
    const installed = {
        installation: {
            id: "installation:own",
            providerId: admission.manifest.providerId,
            accountId: instance.id,
            endpoint: "http://127.0.0.1:5103",
            approval: { manifestVersion: coordinate.version, manifestDigest: coordinate.digest },
        },
        observation: {
            report: {
                protocol: "ulvia-provider/v1",
                providerId: admission.manifest.providerId,
                instanceId: instance.id,
                account: { id: instance.id, label: instance.label },
                buildVersion: "1.0.0",
                manifest: coordinate,
                implementations: pins.map((pin) => ({ ...pin, status: "ready" })),
            },
        },
    };
    const stores = {
        releases: catalogue,
        manifests: { get: async () => ({ admission }) },
        installations: { list: async () => [installed] },
        selections: {
            get: async () => ({
                plan: { selections: pins.map((pin) => ({ ...pin, installationId: installed.installation.id })) },
            }),
        },
    } as unknown as Parameters<typeof reviewSystemUpgrade>[2];
    return { instance, stores, system, installed, support: new ProviderExecutionSupport(), resources };
}
