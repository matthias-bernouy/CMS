import { createHash, randomUUID } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { ProviderInstanceRegistry } from "./registry";
import type { SystemInstallationPlan } from "./installationPlan";
import type { InstanceTransitionRecord, InstanceTransitionStore } from "./transitions";
import type { ProviderInstanceRecord } from "./types";
import {
    executeProvisioningStep,
    PROVISION_STEPS,
    REGISTRY_STEPS,
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
            authorizeExtension?(instance: ProviderInstanceRecord, administratorSub: string): Promise<boolean>;
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

    async createRepository(
        instanceId: string,
        source: SystemInstallationPlan,
        target: SystemInstallationPlan,
        expectedRevision: number,
        administratorSub: string,
    ): Promise<ProviderInstanceRecord> {
        source = structuredClone(source);
        target = structuredClone(target);
        const instance = await requiredInstance(this.instances, instanceId);
        if (instance.status !== "ready") {
            throw new Error("Instance is not ready for Registry creation");
        }
        assertRegistryExtension(source, target);
        await this.assertExtensionAuthority(instance, administratorSub);
        if (instance.revision !== expectedRevision) {
            if (
                instance.repository?.configured &&
                instance.repository.url === instance.cmsUrl &&
                instance.systemPlan?.contracts.some((pin) => pin.contractId === "ulvia/repository")
            ) {
                return instance;
            }
            throw Object.assign(new Error("Registry creation revision conflict"), { status: 409 });
        }
        return this.transition(instanceId, target, administratorSub, expectedRevision);
    }

    async repositoryCreation(instance: ProviderInstanceRecord) {
        const plan = instance.systemPlan;
        return plan?.contracts.some(({ contractId }) => contractId === "ulvia/repository")
            ? this.transitions.get(transitionId(instance.id, plan, "registry"))
            : null;
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
        requestedTarget: SystemInstallationPlan | undefined,
        administratorSub?: string,
        sourceRevision?: number,
    ): Promise<ProviderInstanceRecord> {
        const instance = await requiredInstance(this.instances, instanceId);
        if (instance.status === "disabled") {
            throw new Error(`Provider instance is disabled: ${instanceId}`);
        }
        const target = requestedTarget ?? instance.systemPlan;
        if (!target) {
            throw new Error("Unfinished legacy provisioning requires its original Provider image");
        }
        const kind = requestedTarget ? "registry" : "provision";
        const transition = await this.transitions.createOrGet({
            id: transitionId(instanceId, target, kind),
            instanceId,
            kind,
            targetPlan: structuredClone(target),
            ...(administratorSub ? { administratorSub, sourceRevision } : {}),
            planVersion: 1,
            steps: kind === "registry" ? REGISTRY_STEPS : PROVISION_STEPS,
            completedSteps: [],
            status: "queued",
        });
        if (transition.status === "succeeded") {
            await this.clearCompletedAdministrator(transition);
            if (
                kind === "registry" &&
                (!instance.repository?.configured || instance.repository.url !== instance.cmsUrl)
            ) {
                return this.instances.update(instance.id, instance.revision, {
                    repository: { url: instance.cmsUrl, configured: true },
                });
            }
            return instance;
        }
        const executable =
            transition.status === "failed"
                ? await this.transitions.requeue(
                      transition.id,
                      transition.revision,
                      this.now().toISOString(),
                      administratorSub,
                      sourceRevision,
                  )
                : transition;
        if (!executable) {
            throw new Error(`Provider transition revision conflict: ${transition.id}`);
        }
        return this.execute(executable);
    }

    private async execute(initial: InstanceTransitionRecord): Promise<ProviderInstanceRecord> {
        if (!initial.targetPlan || initial.planVersion !== 1 || !["provision", "registry"].includes(initial.kind)) {
            throw new Error("Unfinished legacy transition requires its original Provider image");
        }
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
        let ownsState = false;
        try {
            instance = await requiredInstance(this.instances, transition.instanceId);
            if (instance.status === "disabled") {
                throw new Error("Provider instance is disabled");
            }
            ownsState = instance.status === "upgrading" || instance.status === "provisioning";
            execution.throwIfLeaseLost();
            if (transition.kind === "registry") {
                await this.assertExtensionAuthority(instance, transition.administratorSub);
            }
            if (
                transition.kind === "registry" &&
                instance.status === "ready" &&
                instance.repository?.configured &&
                instance.repository.url === instance.cmsUrl &&
                instance.systemPlan?.manifest.digest === transition.targetPlan.manifest.digest &&
                transition.steps.every((step) => transition.completedSteps.includes(step))
            ) {
                if (!(await this.transitions.succeed(transition.id, owner, this.now().toISOString()))) {
                    lease.lose(transition.id);
                }
                return instance;
            }
            if (
                transition.kind === "registry" &&
                instance.status === "ready" &&
                instance.revision !== transition.sourceRevision
            ) {
                throw Object.assign(new Error("Registry creation revision conflict"), { status: 409 });
            }
            if (instance.status === "failed" || instance.status === "ready") {
                instance = await this.instances.update(instance.id, instance.revision, {
                    status: transition.kind === "registry" ? "upgrading" : "provisioning",
                    systemPlan: transition.targetPlan,
                    failure: null,
                });
                ownsState = true;
            }
            execution.throwIfLeaseLost();
            await this.clearCompletedAdministrator(transition);
            execution.throwIfLeaseLost();
            const plan = transition.targetPlan;
            if (!plan) {
                throw new Error("Unfinished legacy transition requires its original Provider image");
            }
            target = await this.openTarget(instance);
            execution.throwIfLeaseLost();
            for (const step of transition.steps as readonly TransitionStep[]) {
                if (transition.completedSteps.includes(step)) {
                    continue;
                }
                if (transition.kind === "registry") {
                    await this.assertExtensionAuthority(instance, transition.administratorSub);
                }
                await executeProvisioningStep(
                    target,
                    plan,
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
                systemPlan: transition.targetPlan,
                ...(transition.kind === "registry" ? { repository: { url: instance.cmsUrl, configured: true } } : {}),
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
            const message = error instanceof Error ? error.message.slice(0, 512) : "System installation failed";
            if (!(await this.transitions.fail(transition.id, owner, message, this.now().toISOString()))) {
                lease.lose(transition.id);
            }
            const latest = await this.instances.get(transition.instanceId);
            if (ownsState && latest && latest.status !== "disabled") {
                await this.instances.update(latest.id, latest.revision, {
                    status: transition.kind === "registry" ? "ready" : "failed",
                    failure: message,
                });
            }
            throw error;
        } finally {
            await lease.stop();
            target?.release?.();
        }
    }

    private async assertExtensionAuthority(instance: ProviderInstanceRecord, sub: string | undefined) {
        const current = await this.instances.get(instance.id);
        if (
            !current ||
            current.status === "disabled" ||
            !sub ||
            !(await this.administratorCredentials.authorizeExtension?.(current, sub))
        ) {
            throw new Error("System extension requires current local administrator authority");
        }
    }

    private async clearCompletedAdministrator(transition: InstanceTransitionRecord): Promise<void> {
        if (transition.kind === "provision" && transition.completedSteps.includes("administrator")) {
            await this.administratorCredentials.clear(transition.instanceId);
        }
    }
}

function transitionId(instanceId: string, target: SystemInstallationPlan, kind: "provision" | "registry"): string {
    return `${kind}:${instanceId}:${createHash("sha256").update(canonicalizeIJson(target)).digest("hex")}`;
}

async function requiredInstance(store: ProviderInstanceRegistry, id: string): Promise<ProviderInstanceRecord> {
    const instance = await store.get(id);
    if (!instance) {
        throw new Error(`Unknown Provider instance: ${id}`);
    }
    return instance;
}

function assertRegistryExtension(source: SystemInstallationPlan, target: SystemInstallationPlan) {
    const same = (a: SystemInstallationPlan["contracts"][number], b: SystemInstallationPlan["contracts"][number]) =>
        a.contractId === b.contractId && a.version === b.version && a.digest === b.digest;
    if (
        source.manifest.digest !== target.manifest.digest ||
        source.contracts.some((pin) => !target.contracts.some((candidate) => same(pin, candidate))) ||
        target.contracts.some(
            (pin) =>
                pin.contractId !== "ulvia/repository" && !source.contracts.some((candidate) => same(pin, candidate)),
        ) ||
        target.contracts.filter(({ contractId }) => contractId === "ulvia/repository").length !== 1
    ) {
        throw new Error("Registry creation must preserve the exact installed manifest and contracts");
    }
}
