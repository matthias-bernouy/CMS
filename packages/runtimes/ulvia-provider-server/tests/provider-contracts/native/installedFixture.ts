import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";
import { gatewayRoute } from "../../../../../features/cms-gateway/tests/fixtures";
import { ProviderExecutionSupport } from "../../../src/runtime/instances/profiles/execution/support";
import { readInstalledExecution } from "../../../src/runtime/instances/profiles/execution/installed";

export async function installedFixture() {
    const route = await gatewayRoute({ contractId: "ulvia/cms.installations", providerId: "ulvia/primary-provider" });
    const installed = structuredClone(route.installation);
    installed.installation.siteId = "default";
    installed.installation.accountId = "instance:one";
    const report = installed.observation!.report;
    report.instanceId = "instance:one";
    report.account.id = "instance:one";
    const instance: ProviderInstanceRecord = {
        id: "instance:one",
        idempotencyKey: "one",
        idempotencyFingerprint: "fingerprint",
        storageKey: "one",
        label: "One",
        cmsUrl: "https://cms.example",
        gatewayUrl: "https://cms.example",
        status: "ready",
        profile: { id: "removed-recipe", version: "0.9.0" },
        revision: 1,
        createdAt: "2026-11-07T00:00:00Z",
        updatedAt: "2026-11-07T00:00:00Z",
    };
    const support = new ProviderExecutionSupport({
        providerId: report.providerId,
        buildVersion: "1.1.0",
        releases: [...report.implementations],
    });
    const model = {
        installed,
        manifest: route.manifest,
        release: route.release,
        selected: [route.selection],
        reads: [] as string[],
    };
    const stores = {
        installations: {
            list: async (site: string) => {
                model.reads.push(`installations:${site}`);
                return [model.installed];
            },
        },
        manifests: {
            get: async (id: string, version: string) => {
                model.reads.push(`manifest:${id}@${version}`);
                return model.manifest;
            },
        },
        releases: {
            get: async (id: string, version: string) => {
                model.reads.push(`contract:${id}@${version}`);
                return model.release;
            },
        },
        selections: {
            get: async (site: string) => {
                model.reads.push(`selections:${site}`);
                return { plan: { selections: model.selected } };
            },
        },
    } as unknown as Parameters<typeof readInstalledExecution>[1];
    return {
        instance,
        model,
        stores,
        support,
        read: () => readInstalledExecution(instance, stores, support, installed.installation.endpoint),
    };
}
