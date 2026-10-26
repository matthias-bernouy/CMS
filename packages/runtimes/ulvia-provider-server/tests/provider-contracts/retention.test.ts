import { expect, test } from "bun:test";
import {
    OfficialInstanceProfiles,
    type OfficialInstanceProfile,
    type ProviderInstanceRecord,
    type InstanceTransitionRecord,
} from "@bernouy/ulvia-provider";
import { assertHostedReleaseRetention } from "../../src/runtime/instances/profiles/retention";

const digest = `sha256:${"a".repeat(64)}`;
const profile: OfficialInstanceProfile = {
    id: "ulvia.official",
    version: "1.0.0",
    upgradeFromVersions: [],
    manifest: { providerId: "ulvia.official", version: "0.1.0", digest },
    collection: { publisherId: "ulvia.official", collectionId: "ulvia-official", version: "1.0.0", digest },
    contracts: [{ contractId: "ulvia.cms.content", version: "1.0.0", digest }],
};
const profiles = new OfficialInstanceProfiles([profile]);
const instance: ProviderInstanceRecord = {
    id: "instance:one",
    idempotencyKey: "one",
    idempotencyFingerprint: digest,
    storageKey: "one",
    kernelUrl: "http://127.0.0.1:5100",
    label: "One",
    status: "disabled",
    profile: { id: profile.id, version: profile.version },
    revision: 1,
    createdAt: "2026-10-01T00:00:00Z",
    updatedAt: "2026-10-01T00:00:00Z",
};

test("even disabled instances retain their exact profile and selected release digests", async () => {
    await expect(
        assertHostedReleaseRetention(profiles, [instance], [], async () => [
            { ...profile.contracts[0]!, location: "site:default" },
        ]),
    ).resolves.toBeUndefined();
    await expect(
        assertHostedReleaseRetention(
            profiles,
            [{ ...instance, profile: { id: profile.id, version: "0.9.0" } }],
            [],
            async () => [],
        ),
    ).rejects.toThrow("drop profile");
    await expect(
        assertHostedReleaseRetention(profiles, [instance], [], async () => [
            { ...profile.contracts[0]!, digest: `sha256:${"b".repeat(64)}`, location: "site:default" },
        ]),
    ).rejects.toThrow("drop ulvia.cms.content");
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
        await expect(assertHostedReleaseRetention(profiles, [instance], [transition], async () => [])).rejects.toThrow(
            "transition:upgrade:one",
        );
        await expect(
            assertHostedReleaseRetention(
                profiles,
                [instance],
                [{ ...transition, status: "succeeded" }],
                async () => [],
            ),
        ).resolves.toBeUndefined();
    }
});
