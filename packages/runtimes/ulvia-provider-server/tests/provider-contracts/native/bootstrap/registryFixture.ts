import { admitProviderManifest } from "@bernouy/ulvia-providers";
import { compileRetainedFeatures } from "@bernouy/ulvia-provider/build";
import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import type { registryInstallationPlan } from "../../../../src/runtime/instances/system/execution/registry";
import { ProviderExecutionSupport } from "../../../../src/runtime/instances/system/execution/support";
import { repositoryFixture } from "../../official/fixture";

export async function historicalRegistryFixture() {
    const f = await repositoryFixture();
    const retained = (await compileRetainedFeatures()).find((build) =>
        build.implementations.some((pin) => pin.contractId === "ulvia/repository" && pin.version === "1.0.0"),
    )!;
    const oldAdmission = retained.contracts.find(({ release }) => release.contractId === "ulvia/repository")!;
    const catalogue = {
        list: (id: string) => f.catalogue.list(id),
        get: async (id: string, version: string) =>
            id === oldAdmission.release.contractId && version === oldAdmission.release.version
                ? { admission: oldAdmission, publishedAt: "2026-11-08T00:00:00Z" }
                : f.catalogue.get(id, version),
    };
    const manifestEntry = (await f.providers.list("provider-manifest"))[0]!;
    const current = JSON.parse(new TextDecoder().decode(await f.providers.get(manifestEntry)));
    const oldRegistry = retained.implementations.find((pin) => pin.contractId === "ulvia/repository")!;
    const admission = await admitProviderManifest(
        {
            ...current,
            version: "1.2.0",
            implementations: current.implementations.map((pin: { contractId: string }) =>
                pin.contractId === oldRegistry.contractId ? oldRegistry : pin,
            ),
        },
        catalogue,
    );
    const instance: ProviderInstanceRecord = {
        id: "instance:historical",
        idempotencyKey: "historical",
        idempotencyFingerprint: "historical",
        storageKey: "historical",
        label: "Historical",
        cmsUrl: "https://historical.example",
        gatewayUrl: "http://old-edge:3000",
        status: "ready",
        revision: 1,
        createdAt: "2026-11-08T00:00:00Z",
        updatedAt: "2026-11-08T00:00:00Z",
    };
    const pins = admission.manifest.implementations
        .filter(({ contractId }) => contractId !== "ulvia/repository")
        .map(({ contractId, version, digest }) => ({ contractId, version, digest }));
    const installed = {
        installation: {
            id: "installation:own",
            providerId: admission.manifest.providerId,
            accountId: instance.id,
            endpoint: "http://ulvia-provider:5103",
            approval: { manifestVersion: admission.manifest.version, manifestDigest: admission.digest },
        },
        observation: {
            report: {
                protocol: "ulvia-provider/v1",
                providerId: admission.manifest.providerId,
                instanceId: instance.id,
                account: { id: instance.id, label: instance.label },
                buildVersion: "1.0.0",
                manifest: { version: admission.manifest.version, digest: admission.digest },
                implementations: pins.map((pin) => ({ ...pin, status: "ready" })),
            },
        },
    };
    const stores = {
        releases: catalogue,
        manifests: {
            get: async (_id: string, version: string) =>
                version === admission.manifest.version ? { admission } : null,
        },
        installations: { list: async () => [installed] },
        selections: {
            get: async () => ({
                plan: { selections: pins.map((pin) => ({ ...pin, installationId: installed.installation.id })) },
            }),
        },
    } as unknown as Parameters<typeof registryInstallationPlan>[1];
    return { instance, stores, installed, oldRegistry, current, support: new ProviderExecutionSupport() };
}
