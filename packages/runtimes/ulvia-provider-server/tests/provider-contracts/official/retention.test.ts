import { expect, test } from "bun:test";
import {
    OfficialInstanceProfiles,
    type OfficialInstanceProfile,
    type ProviderInstanceRecord,
    type InstanceTransitionRecord,
} from "@bernouy/ulvia-provider";
import { ProviderExecutionSupport } from "../../../src/runtime/instances/profiles/execution/support";
import { assertHostedReleaseRetention } from "../../../src/runtime/instances/profiles/retention";

const digest = `sha256:${"a".repeat(64)}`;
const profile: OfficialInstanceProfile = {
    id: "ulvia",
    version: "1.0.0",
    upgradeFromVersions: [],
    manifest: { providerId: "ulvia/primary-provider", version: "0.1.0", digest },
    collections: [{ publisherId: "ulvia", collectionId: "ulvia/mossa", version: "1.0.0", digest }],
    initialPages: [],
    contracts: [{ contractId: "ulvia/cms.content", version: "1.0.0", digest }],
};
const profiles = new OfficialInstanceProfiles([profile]);
const support = new ProviderExecutionSupport({
    providerId: profile.manifest.providerId,
    buildVersion: "1.0.0",
    releases: [...profile.contracts],
});
const instance: ProviderInstanceRecord = {
    id: "instance:one",
    idempotencyKey: "one",
    idempotencyFingerprint: digest,
    storageKey: "one",
    cmsUrl: "http://127.0.0.1:5100",
    label: "One",
    status: "disabled",
    profile: { id: profile.id, version: profile.version },
    revision: 1,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
};

test("even disabled instances retain their exact profile and selected release digests", async () => {
    await expect(
        assertHostedReleaseRetention(
            support,
            [instance],
            [],
            async () => [{ ...profile.contracts[0]!, location: "site:default" }],
            profiles,
        ),
    ).resolves.toBeUndefined();
    await expect(
        assertHostedReleaseRetention(
            support,
            [{ ...instance, profile: { id: "removed-recipe", version: "0.9.0" } }],
            [],
            async () => [],
            {
                ...profiles,
                resolve: () => {
                    throw new Error("Must not load a recipe");
                },
            } as never,
        ),
    ).resolves.toBeUndefined();
    await expect(
        assertHostedReleaseRetention(
            support,
            [instance],
            [],
            async () => [{ ...profile.contracts[0]!, digest: `sha256:${"b".repeat(64)}`, location: "site:default" }],
            profiles,
        ),
    ).rejects.toThrow("does not support ulvia/cms.content");
});

test("queued, running and retryable failed transitions retain both profiles", async () => {
    for (const status of ["queued", "running", "failed"] as const) {
        const transition: InstanceTransitionRecord = {
            id: "upgrade:one",
            instanceId: instance.id,
            kind: "upgrade",
            sourceProfile: { id: profile.id, version: "0.9.0" },
            targetProfile: instance.profile,
            planVersion: 1,
            steps: [],
            completedSteps: [],
            status,
            revision: 1,
            createdAt: instance.createdAt,
            updatedAt: instance.updatedAt,
        };
        await expect(
            assertHostedReleaseRetention(support, [instance], [transition], async () => [], profiles),
        ).rejects.toThrow("transition:upgrade:one");
        await expect(
            assertHostedReleaseRetention(
                support,
                [instance],
                [{ ...transition, status: "succeeded" }],
                async () => [],
                profiles,
            ),
        ).resolves.toBeUndefined();
    }
});
