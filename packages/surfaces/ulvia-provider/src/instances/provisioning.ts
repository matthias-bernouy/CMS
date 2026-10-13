import { randomUUID } from "node:crypto";
import type { ProviderInstanceRegistry } from "./registry";
import {
    canUpgradeOfficialInstanceProfile,
    resolveOfficialInstanceProfile,
    type OfficialInstanceProfile,
} from "./officialProfile";
import type { InstanceTransitionRecord, InstanceTransitionStore } from "./transitions";
import type { ProviderInstanceProfile, ProviderInstanceRecord } from "./types";
import {
    executeProvisioningStep,
    PROVISION_STEPS,
    UPGRADE_STEPS,
    type OfficialInstanceProvisioningTarget,
    type ProviderInstanceAdministrator,
    type TransitionStep,
} from "./provisioningTarget";
import { ProviderInstanceTransitionLease, transitionLeaseExpiry } from "./transitionLease";

const DEFAULT_LEASE_MS = 30_000;

export type { OfficialInstanceProvisioningTarget, ProviderInstanceAdministrator } from "./provisioningTarget";
export type { ProviderInstanceTransitionExecution } from "./transitionLease";

export class OfficialInstanceProvisioner {
    constructor(
        private readonly instances: ProviderInstanceRegistry,
        private readonly transitions: InstanceTransitionStore,
        private readonly openTarget: (instance: ProviderInstanceRecord) => Promise<OfficialInstanceProvisioningTarget>,
        private readonly administratorCredentials: Readonly<{
            read(instanceId: string): Promise<ProviderInstanceAdministrator | null>;
            clear(instanceId: string): Promise<void>;
        }>,
        private readonly now: () => Date = () => new Date(),
        private readonly leaseMs = DEFAULT_LEASE_MS,
    ) {
        if (!Number.isSafeInteger(leaseMs) || leaseMs < 3) {
            throw new TypeError("Provider instance transition lease duration must be at least 3 milliseconds");
        }
    }

    provision(instanceId: string): Promise<ProviderInstanceRecord> {
        return this.transition(instanceId, undefined);
    }

    upgrade(instanceId: string, target: ProviderInstanceProfile): Promise<ProviderInstanceRecord> {
        return this.transition(instanceId, target);
    }

    async recover(limit = 100): Promise<number> {
        const transitions = await this.transitions.listRecoverable(this.now().toISOString(), limit);
        for (const transition of transitions) {
            await this.execute(transition).catch(() => undefined);
        }
        return transitions.length;
    }

    private async transition(
        instanceId: string,
        requestedTarget: ProviderInstanceProfile | undefined,
    ): Promise<ProviderInstanceRecord> {
        const instance = await requiredInstance(this.instances, instanceId);
        if (instance.status === "disabled") {
            throw new Error(`Provider instance is disabled: ${instanceId}`);
        }
        const target = requestedTarget ?? instance.profile;
        const targetProfile = exactProfile(target);
        if (requestedTarget && instance.status === "ready" && sameProfile(instance.profile, target)) {
            return instance;
        }
        if (requestedTarget && !sameProfile(instance.profile, target)) {
            const sourceProfile = exactProfile(instance.profile);
            if (!canUpgradeOfficialInstanceProfile(sourceProfile, targetProfile)) {
                throw new Error(
                    `Unsupported Provider instance profile transition: ${sourceProfile.id}@${sourceProfile.version} -> ${targetProfile.id}@${targetProfile.version}`,
                );
            }
        }
        const kind = requestedTarget ? "upgrade" : "provision";
        const transition = await this.transitions.createOrGet({
            id: transitionId(instanceId, target),
            instanceId,
            kind,
            ...(kind === "upgrade" ? { sourceProfile: instance.profile } : {}),
            targetProfile: target,
            planVersion: 1,
            steps: kind === "upgrade" ? UPGRADE_STEPS : PROVISION_STEPS,
            completedSteps: [],
            status: "queued",
        });
        if (transition.status === "succeeded") {
            await this.clearCompletedAdministrator(transition);
            return instance;
        }
        const executable =
            transition.status === "failed"
                ? await this.transitions.requeue(transition.id, transition.revision, this.now().toISOString())
                : transition;
        if (!executable) {
            throw new Error(`Provider transition revision conflict: ${transition.id}`);
        }
        return this.execute(executable);
    }

    private async execute(initial: InstanceTransitionRecord): Promise<ProviderInstanceRecord> {
        let transition = initial;
        const owner = randomUUID();
        const now = this.now();
        if (
            !(await this.transitions.claim(
                transition.id,
                transition.revision,
                owner,
                transitionLeaseExpiry(now, this.leaseMs),
                now.toISOString(),
            ))
        ) {
            throw new Error(`Provider transition is already running: ${transition.id}`);
        }
        const lease = new ProviderInstanceTransitionLease(
            this.transitions,
            transition.id,
            owner,
            this.now,
            this.leaseMs,
        );
        const execution = lease.execution;
        let target: OfficialInstanceProvisioningTarget | undefined;
        let instance: ProviderInstanceRecord | undefined;
        try {
            instance = await requiredInstance(this.instances, transition.instanceId);
            execution.throwIfLeaseLost();
            if (instance.status === "failed" || instance.status === "ready") {
                instance = await this.instances.update(instance.id, instance.revision, {
                    status: transition.kind === "upgrade" ? "upgrading" : "provisioning",
                    failure: null,
                });
            }
            execution.throwIfLeaseLost();
            await this.clearCompletedAdministrator(transition);
            execution.throwIfLeaseLost();
            const profile = exactProfile(transition.targetProfile);
            target = await this.openTarget(instance);
            execution.throwIfLeaseLost();
            for (const step of transition.steps as readonly TransitionStep[]) {
                if (transition.completedSteps.includes(step)) {
                    continue;
                }
                await executeProvisioningStep(
                    target,
                    profile,
                    step,
                    await this.administratorCredentials.read(instance.id),
                    execution,
                );
                execution.throwIfLeaseLost();
                const updated = await this.transitions.completeStep(
                    transition.id,
                    owner,
                    step,
                    this.now().toISOString(),
                );
                if (!updated) {
                    return lease.lose(transition.id);
                }
                transition = updated;
                await this.clearCompletedAdministrator(transition);
                execution.throwIfLeaseLost();
            }
            execution.throwIfLeaseLost();
            instance = await this.instances.update(instance.id, instance.revision, {
                status: "ready",
                profile: transition.targetProfile,
                failure: null,
            });
            if (!(await this.transitions.succeed(transition.id, owner, this.now().toISOString()))) {
                lease.lose(transition.id);
            }
            return instance;
        } catch (error) {
            if (lease.lost) {
                throw lease.reason;
            }
            const message = error instanceof Error ? error.message.slice(0, 512) : "Profile transition failed";
            if (!(await this.transitions.fail(transition.id, owner, message, this.now().toISOString()))) {
                lease.lose(transition.id);
            }
            const latest = await this.instances.get(transition.instanceId);
            if (latest && latest.status !== "disabled") {
                await this.instances.update(latest.id, latest.revision, { status: "failed", failure: message });
            }
            throw error;
        } finally {
            await lease.stop();
            target?.release?.();
        }
    }

    private async clearCompletedAdministrator(transition: InstanceTransitionRecord): Promise<void> {
        if (transition.kind === "provision" && transition.completedSteps.includes("administrator")) {
            await this.administratorCredentials.clear(transition.instanceId);
        }
    }
}

function exactProfile(profile: ProviderInstanceProfile): OfficialInstanceProfile {
    const resolved = resolveOfficialInstanceProfile(profile.id, profile.version);
    if (!resolved) {
        throw new Error(`Unsupported Provider instance profile: ${profile.id}@${profile.version}`);
    }
    return resolved;
}

function transitionId(instanceId: string, target: ProviderInstanceProfile): string {
    return `profile:${instanceId}:${target.id}:${target.version}`;
}

function sameProfile(left: ProviderInstanceProfile, right: ProviderInstanceProfile): boolean {
    return left.id === right.id && left.version === right.version;
}

async function requiredInstance(store: ProviderInstanceRegistry, id: string): Promise<ProviderInstanceRecord> {
    const instance = await store.get(id);
    if (!instance) {
        throw new Error(`Unknown Provider instance: ${id}`);
    }
    return instance;
}
