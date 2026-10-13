import type { ProviderInstanceRecord } from "./types";
import type { ProviderInstanceRegistry } from "./registry";
import { resolveOfficialInstanceProfile, type OfficialInstanceProfile } from "./officialProfile";

const STEPS = ["manifest", "provider", "contracts", "collection", "administrator"] as const;
type ProvisioningStep = (typeof STEPS)[number];

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
        private readonly openTarget: (instance: ProviderInstanceRecord) => Promise<OfficialInstanceProvisioningTarget>,
    ) {}

    async provision(instanceId: string, administrator: ProviderInstanceAdministrator): Promise<ProviderInstanceRecord> {
        let instance = await this.instances.get(instanceId);
        if (!instance) {
            throw new Error(`Unknown Provider instance: ${instanceId}`);
        }
        const profile = exactProfile(instance);
        if (instance.status === "disabled") {
            throw new Error(`Provider instance is disabled: ${instanceId}`);
        }
        if (instance.status === "ready") {
            return instance;
        }
        if (instance.status === "failed") {
            instance = await this.instances.update(instance.id, instance.revision, {
                status: "provisioning",
                failure: null,
            });
        }
        const target = await this.openTarget(instance);
        try {
            for (const step of STEPS) {
                if (instance.completedSteps.includes(step)) {
                    continue;
                }
                await executeStep(target, profile, step, administrator);
                instance = await this.instances.update(instance.id, instance.revision, {
                    completedSteps: [...instance.completedSteps, step],
                });
            }
            return this.instances.update(instance.id, instance.revision, { status: "ready", failure: null });
        } catch (error) {
            const message = error instanceof Error ? error.message.slice(0, 512) : "Provisioning failed";
            await this.instances.update(instance.id, instance.revision, { status: "failed", failure: message });
            throw error;
        } finally {
            target.release?.();
        }
    }
}

function exactProfile(instance: ProviderInstanceRecord): OfficialInstanceProfile {
    const profile = resolveOfficialInstanceProfile(instance.profile.id, instance.profile.version);
    if (!profile) {
        throw new Error(`Unsupported Provider instance profile: ${instance.profile.id}@${instance.profile.version}`);
    }
    return profile;
}

function executeStep(
    target: OfficialInstanceProvisioningTarget,
    profile: OfficialInstanceProfile,
    step: ProvisioningStep,
    administrator: ProviderInstanceAdministrator,
): Promise<void> {
    switch (step) {
        case "manifest":
            return target.importManifest(profile);
        case "provider":
            return target.connectProvider(profile);
        case "contracts":
            return target.selectContracts(profile);
        case "collection":
            return target.installCollection(profile);
        case "administrator":
            return target.initializeAdministrator(administrator);
    }
}
