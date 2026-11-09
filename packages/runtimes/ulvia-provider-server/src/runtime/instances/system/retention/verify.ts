import type { SystemInstallationPlan, SystemInstallationSource } from "@bernouy/ulvia-provider";
import type { ProviderExecutionSupport } from "../execution/support";
import type { RetentionRecords, RetentionReader } from "./interfaces";

/** Bounded metadata cursors; never retain all tenants, transitions or plans in memory. */
export async function assertHostedReleaseRetention(
    support: ProviderExecutionSupport,
    records: RetentionRecords,
    reader: RetentionReader,
    system: SystemInstallationSource,
): Promise<void> {
    let current: Promise<SystemInstallationPlan> | undefined;
    const assertAvailable = async (plan: SystemInstallationPlan | undefined, location: string) => {
        const available = await (current ??= system.current());
        if (!plan || plan.manifest.digest !== available.manifest.digest) {
            throw new Error(`Provider image cannot recover ${location}; finish it with the original image`);
        }
        for (const pin of plan.contracts) {
            support.assert(pin, location);
        }
    };
    for await (const transition of records.transitions()) {
        if (transition.status === "succeeded") {
            continue;
        }
        if (
            !["queued", "running", "failed"].includes(transition.status) ||
            !transition.targetPlan ||
            !["provision", "registry", "upgrade"].includes(transition.kind) ||
            (transition.kind === "upgrade" && !transition.sourcePlan)
        ) {
            throw new Error(
                `Provider image cannot recover transition:${transition.id}; finish it with the original image`,
            );
        }
        if (
            transition.kind === "provision" ||
            (transition.kind === "upgrade" && !transition.completedSteps.includes("manifest"))
        ) {
            await assertAvailable(transition.targetPlan, `transition:${transition.id}`);
        }
        for (const plan of [transition.sourcePlan, transition.targetPlan]) {
            for (const pin of plan?.contracts ?? []) {
                support.assert(pin, `transition:${transition.id}`);
            }
        }
    }
    for await (const instance of records.instances) {
        if (instance.status === "upgrading" && !instance.systemPlan) {
            throw new Error(`Provider image cannot recover instance:${instance.id}; finish it with the original image`);
        }
        if (!["ready", "disabled", "upgrading"].includes(instance.status)) {
            await assertAvailable(instance.systemPlan, `instance:${instance.id}`);
        }
        const targetNotAdmitted = await records.hasUnstagedUpgrade(instance.id);
        for await (const transition of records.transitions(instance.id)) {
            if (transition.status === "succeeded" || !["registry", "upgrade"].includes(transition.kind)) {
                continue;
            }
            if (transition.sourcePlan) {
                await reader.assertPlan(instance, transition.sourcePlan);
            }
            if (transition.kind !== "upgrade" || transition.completedSteps.includes("manifest")) {
                await reader.assertPlan(instance, transition.targetPlan);
            }
        }
        for (const release of await reader.required(instance, targetNotAdmitted)) {
            support.assert(release, release.location);
        }
    }
}
