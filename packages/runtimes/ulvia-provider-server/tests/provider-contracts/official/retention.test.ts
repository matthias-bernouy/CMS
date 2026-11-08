import { expect, test } from "bun:test";
import {
    type SystemInstallationPlan,
    type ProviderInstanceRecord,
    type InstanceTransitionRecord,
} from "@bernouy/ulvia-provider";
import { ProviderExecutionSupport } from "../../../src/runtime/instances/system/execution/support";
import { assertHostedReleaseRetention } from "../../../src/runtime/instances/system/retention";

const digest = `sha256:${"a".repeat(64)}`;
const plan: SystemInstallationPlan = {
    manifest: { providerId: "ulvia/primary-provider", version: "0.1.0", digest },
    contracts: [{ contractId: "ulvia/cms.content", version: "1.0.0", digest }],
};
const system = { current: async () => plan };
const support = new ProviderExecutionSupport({
    providerId: plan.manifest.providerId,
    buildVersion: "1.0.0",
    releases: [...plan.contracts],
});
const instance: ProviderInstanceRecord = {
    id: "instance:one",
    idempotencyKey: "one",
    idempotencyFingerprint: digest,
    storageKey: "one",
    cmsUrl: "http://127.0.0.1:5100",
    label: "One",
    status: "disabled",
    systemPlan: plan,
    gatewayUrl: "http://edge.internal:3000",
    revision: 1,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
};

test("even disabled instances retain their exact installed and selected release digests", async () => {
    await expect(
        assertHostedReleaseRetention(
            support,
            [instance],
            [],
            async () => [{ ...plan.contracts[0]!, location: "site:default" }],
            system,
        ),
    ).resolves.toBeUndefined();
    await expect(
        assertHostedReleaseRetention(support, [instance], [], async () => [], {
            current: () => {
                throw new Error("Must not load a recipe");
            },
        } as never),
    ).resolves.toBeUndefined();
    await expect(
        assertHostedReleaseRetention(
            support,
            [instance],
            [],
            async () => [{ ...plan.contracts[0]!, digest: `sha256:${"b".repeat(64)}`, location: "site:default" }],
            system,
        ),
    ).rejects.toThrow("does not support ulvia/cms.content");
});

test("queued, running and retryable failed transitions retain their exact system plan", async () => {
    for (const status of ["queued", "running", "failed"] as const) {
        const transition: InstanceTransitionRecord = {
            id: "upgrade:one",
            instanceId: instance.id,
            kind: "provision",
            targetPlan: { ...plan, manifest: { ...plan.manifest, digest: `sha256:${"f".repeat(64)}` } },
            planVersion: 1,
            steps: [],
            completedSteps: [],
            status,
            revision: 1,
            createdAt: instance.createdAt,
            updatedAt: instance.updatedAt,
        };
        await expect(
            assertHostedReleaseRetention(support, [instance], [transition], async () => [], system),
        ).rejects.toThrow("transition:upgrade:one");
        await expect(
            assertHostedReleaseRetention(
                support,
                [instance],
                [{ ...transition, status: "succeeded" }],
                async () => [],
                system,
            ),
        ).resolves.toBeUndefined();
    }
});
