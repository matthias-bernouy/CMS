import { expect, test } from "bun:test";
import type { InstanceTransitionRecord } from "@bernouy/ulvia-provider";
import { registryInstallationPlan } from "../../../../src/runtime/instances/system/execution/registry";
import { readStoredPlan } from "../../../../src/runtime/instances/system/execution/plan";
import { ProviderExecutionSupport } from "../../../../src/runtime/instances/system/execution/support";
import { assertHostedReleaseRetention } from "../../../../src/runtime/instances/system/retention";
import { historicalRegistryFixture } from "./registryFixture";

test("Registry activation after an image replacement uses the old approved manifest and its exact Registry pin", async () => {
    const f = await historicalRegistryFixture();
    const before = structuredClone(f.installed);
    const { source, target } = await registryInstallationPlan(
        f.instance,
        f.stores,
        f.support,
        f.installed.installation.endpoint,
    );
    expect(target.manifest.version).toBe("1.2.0");
    expect(target.manifest.version).not.toBe(f.current.version);
    expect(target.contracts.find(({ contractId }) => contractId === "ulvia/repository")).toMatchObject({
        version: "1.0.0",
        digest: f.oldRegistry.digest,
    });
    expect(target.contracts.filter(({ contractId }) => contractId !== "ulvia/repository")).toEqual(source.contracts);
    expect(await readStoredPlan(target, f.stores, f.support)).toHaveLength(target.contracts.length);
    expect(f.installed).toEqual(before);
    const recovering = { ...f.instance, status: "upgrading" as const, systemPlan: target };
    const transition: InstanceTransitionRecord = {
        id: "registry:historical",
        instanceId: f.instance.id,
        kind: "registry",
        targetPlan: target,
        sourceRevision: 1,
        administratorSub: "local:admin",
        planVersion: 1,
        steps: ["provider", "contracts"],
        completedSteps: ["provider"],
        status: "running",
        revision: 1,
        createdAt: f.instance.createdAt,
        updatedAt: f.instance.updatedAt,
    };
    await assertHostedReleaseRetention(
        f.support,
        [recovering],
        [transition],
        async (_instance, plans = []) => {
            for (const plan of plans) {
                await readStoredPlan(plan, f.stores, f.support);
            }
            return target.contracts.map((pin) => ({ ...pin, location: "stored Registry transition" }));
        },
        {
            current: async () => {
                throw new Error("Must not read the current image snapshot");
            },
        },
    );
}, 30_000);

test("missing executable Registry support refuses the old plan without changing approved state", async () => {
    const f = await historicalRegistryFixture();
    const before = structuredClone(f.installed);
    const support = new ProviderExecutionSupport({
        providerId: f.support.providerId,
        buildVersion: f.support.buildVersion,
        releases: f.support.releases.filter(({ contractId }) => contractId !== "ulvia/repository"),
    });
    await expect(
        registryInstallationPlan(f.instance, f.stores, support, f.installed.installation.endpoint),
    ).rejects.toThrow("does not support ulvia/repository");
    expect(f.installed).toEqual(before);
}, 30_000);
