import { expect, test } from "bun:test";
import { SystemBootstrap } from "../../../../src/runtime/instances/system/execution/SystemBootstrap";
import { reviewSystemUpgrade } from "../../../../src/runtime/instances/system/execution/upgrades";
import { assertHostedReleaseRetention } from "../../../../src/runtime/instances/system/retention";
import type { InstanceTransitionRecord } from "@bernouy/ulvia-provider";
import { repositoryFixture } from "../../official/fixture";
import { historicalRegistryFixture } from "./registryFixture";

test("review pins the shipped manifest, preserves enabled Registry and binds source revision and administrator", async () => {
    const f = await historicalRegistryFixture();
    const { contractId, version, digest } = f.oldRegistry;
    f.installed.observation.report.implementations.push({ contractId, version, digest, status: "ready" });
    const before = structuredClone(f.installed);
    const resources = await repositoryFixture();
    const system = new SystemBootstrap(resources);
    const available = await system.available();
    const input = { expectedRevision: 1, administratorSub: "local:admin", manifestDigest: available.manifest.digest };
    const review = await reviewSystemUpgrade(
        f.instance,
        input,
        f.stores,
        f.support,
        system,
        f.installed.installation.endpoint,
    );
    expect(review.source.manifest.version).toBe("1.2.0");
    expect(review.target.manifest.version).toBe("1.3.0");
    expect(review.target.contracts.find(({ contractId }) => contractId === "ulvia/repository")?.version).toBe("1.2.0");
    expect(review.planDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    const other = await reviewSystemUpgrade(
        f.instance,
        { ...input, administratorSub: "local:other" },
        f.stores,
        f.support,
        system,
        f.installed.installation.endpoint,
    );
    expect(other.planDigest).not.toBe(review.planDigest);
    await expect(
        reviewSystemUpgrade(
            f.instance,
            { ...input, expectedRevision: 2 },
            f.stores,
            f.support,
            system,
            f.installed.installation.endpoint,
        ),
    ).rejects.toThrow("revision");
    await expect(
        reviewSystemUpgrade(
            f.instance,
            { ...input, manifestDigest: `sha256:${"f".repeat(64)}` },
            f.stores,
            f.support,
            system,
            f.installed.installation.endpoint,
        ),
    ).rejects.toThrow("exact release");
    expect(f.installed).toEqual(before);
});

test("unfinished system admission retains its source and needs the exact kit; admitted recovery is kit independent", async () => {
    const f = await historicalRegistryFixture();
    const system = new SystemBootstrap(await repositoryFixture());
    const available = await system.available();
    const review = await reviewSystemUpgrade(
        f.instance,
        { expectedRevision: 1, administratorSub: "local:admin", manifestDigest: available.manifest.digest },
        f.stores,
        f.support,
        system,
        f.installed.installation.endpoint,
    );
    const transition: InstanceTransitionRecord = {
        id: "upgrade:test",
        instanceId: f.instance.id,
        kind: "upgrade",
        sourcePlan: review.source,
        targetPlan: review.target,
        sourceRevision: 1,
        administratorSub: "local:admin",
        planVersion: 1,
        steps: ["manifest", "provider", "contracts"],
        completedSteps: [],
        status: "running",
        revision: 1,
        createdAt: f.instance.createdAt,
        updatedAt: f.instance.updatedAt,
    };
    const instance = { ...f.instance, status: "upgrading" as const, systemPlan: review.target };
    const reads: unknown[] = [];
    await assertHostedReleaseRetention(
        f.support,
        [instance],
        [transition],
        async (_instance, plans, unstaged) => {
            reads.push({ plans, unstaged });
            return [];
        },
        system,
    );
    expect(reads).toEqual([{ plans: [review.source], unstaged: true }]);
    await expect(
        assertHostedReleaseRetention(f.support, [instance], [transition], async () => [], {
            current: async () => ({
                ...review.target,
                manifest: { ...review.target.manifest, digest: `sha256:${"f".repeat(64)}` },
            }),
        }),
    ).rejects.toThrow("original image");
    reads.length = 0;
    await assertHostedReleaseRetention(
        f.support,
        [instance],
        [{ ...transition, completedSteps: ["manifest"] }],
        async (_instance, plans, unstaged) => {
            reads.push({ plans, unstaged });
            return [];
        },
        {
            current: async () => {
                throw new Error("Must not read the kit after admission");
            },
        },
    );
    expect(reads).toEqual([{ plans: [review.source, review.target], unstaged: false }]);
});
