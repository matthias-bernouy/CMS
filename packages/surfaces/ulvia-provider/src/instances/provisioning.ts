import { randomUUID } from "node:crypto";
import type { ProviderInstanceRegistry } from "./registry";
import { resolveOfficialInstanceProfile, type OfficialInstanceProfile } from "./officialProfile";
import type { InstanceTransitionRecord, InstanceTransitionStore } from "./transitions";
import type { ProviderInstanceProfile, ProviderInstanceRecord } from "./types";

const PROVISION_STEPS = ["manifest", "provider", "contracts", "collection", "administrator"] as const;
const UPGRADE_STEPS = ["manifest", "provider", "contracts", "collection"] as const;
const LEASE_MS = 30_000;

type TransitionStep = (typeof PROVISION_STEPS)[number];

export type ProviderInstanceAdministrator = Readonly<{ email: string; password: string }>;

export interface OfficialInstanceProvisioningTarget {
    importManifest(profile: OfficialInstanceProfile): Promise<void>;
    connectProvider(profile: OfficialInstanceProfile): Promise<void>;
    selectContracts(profile: OfficialInstanceProfile): Promise<void>;
    installCollection(profile: OfficialInstanceProfile): Promise<void>;
    initializeAdministrator(administrator: ProviderInstanceAdministrator): Promise<void>;
    release?(): void;
}

export class OfficialInstanceProvisioner {
    constructor(
        private readonly instances: ProviderInstanceRegistry,
        private readonly transitions: InstanceTransitionStore,
        private readonly openTarget: (instance: ProviderInstanceRecord) => Promise<OfficialInstanceProvisioningTarget>,
        private readonly readAdministrator: (instanceId: string) => Promise<ProviderInstanceAdministrator | null>,
        private readonly now: () => Date = () => new Date(),
    ) {}

    provision(instanceId: string): Promise<ProviderInstanceRecord> {
        return this.transition(instanceId, undefined);
    }

    upgrade(instanceId: string, target: ProviderInstanceProfile): Promise<ProviderInstanceRecord> {
        return this.transition(instanceId, target);
    }

    async recover(limit = 100): Promise<void> {
        for (const transition of await this.transitions.listRecoverable(this.now().toISOString(), limit)) {
            await this.execute(transition).catch(() => undefined);
        }
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
        exactProfile(target);
        if (requestedTarget && instance.status === "ready" && sameProfile(instance.profile, target)) {
            return instance;
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
                expiresAt(now),
                now.toISOString(),
            ))
        ) {
            throw new Error(`Provider transition is already running: ${transition.id}`);
        }
        let instance = await requiredInstance(this.instances, transition.instanceId);
        if (instance.status === "failed" || instance.status === "ready") {
            instance = await this.instances.update(instance.id, instance.revision, {
                status: transition.kind === "upgrade" ? "upgrading" : "provisioning",
                failure: null,
            });
        }
        const profile = exactProfile(transition.targetProfile);
        const target = await this.openTarget(instance);
        const heartbeat = maintainLease(this.transitions, transition.id, owner, this.now);
        try {
            for (const step of transition.steps as readonly TransitionStep[]) {
                if (transition.completedSteps.includes(step)) {
                    continue;
                }
                await executeStep(target, profile, step, await this.readAdministrator(instance.id));
                const updated = await this.transitions.completeStep(
                    transition.id,
                    owner,
                    step,
                    this.now().toISOString(),
                );
                if (!updated) {
                    throw new Error(`Provider transition lease was lost: ${transition.id}`);
                }
                transition = updated;
            }
            instance = await this.instances.update(instance.id, instance.revision, {
                status: "ready",
                profile: transition.targetProfile,
                failure: null,
            });
            if (!(await this.transitions.succeed(transition.id, owner, this.now().toISOString()))) {
                throw new Error(`Provider transition lease was lost: ${transition.id}`);
            }
            return instance;
        } catch (error) {
            const message = error instanceof Error ? error.message.slice(0, 512) : "Profile transition failed";
            await this.transitions.fail(transition.id, owner, message, this.now().toISOString());
            const latest = await this.instances.get(instance.id);
            if (latest && latest.status !== "disabled") {
                await this.instances.update(latest.id, latest.revision, { status: "failed", failure: message });
            }
            throw error;
        } finally {
            heartbeat.stop();
            target.release?.();
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

async function executeStep(
    target: OfficialInstanceProvisioningTarget,
    profile: OfficialInstanceProfile,
    step: TransitionStep,
    administrator: ProviderInstanceAdministrator | null,
): Promise<void> {
    if (step === "manifest") {
        return target.importManifest(profile);
    }
    if (step === "provider") {
        return target.connectProvider(profile);
    }
    if (step === "contracts") {
        return target.selectContracts(profile);
    }
    if (step === "collection") {
        return target.installCollection(profile);
    }
    if (!administrator) {
        throw new Error("Provisioning administrator credentials are unavailable");
    }
    return target.initializeAdministrator(administrator);
}

function transitionId(instanceId: string, target: ProviderInstanceProfile): string {
    return `profile:${instanceId}:${target.id}:${target.version}`;
}

function sameProfile(left: ProviderInstanceProfile, right: ProviderInstanceProfile): boolean {
    return left.id === right.id && left.version === right.version;
}

function expiresAt(now: Date): string {
    return new Date(now.getTime() + LEASE_MS).toISOString();
}

function maintainLease(store: InstanceTransitionStore, id: string, owner: string, now: () => Date): { stop(): void } {
    const timer = setInterval(() => {
        const current = now();
        void store.renew(id, owner, expiresAt(current), current.toISOString());
    }, LEASE_MS / 3);
    timer.unref?.();
    return { stop: () => clearInterval(timer) };
}

async function requiredInstance(store: ProviderInstanceRegistry, id: string): Promise<ProviderInstanceRecord> {
    const instance = await store.get(id);
    if (!instance) {
        throw new Error(`Unknown Provider instance: ${id}`);
    }
    return instance;
}
