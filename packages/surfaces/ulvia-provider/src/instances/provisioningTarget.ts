import type { OfficialInstanceProfile } from "./officialProfile";
import type { ProviderInstanceTransitionExecution } from "./transitionLease";

export const PROVISION_STEPS = ["manifest", "provider", "contracts", "collection", "administrator"] as const;
export const UPGRADE_STEPS = ["manifest", "provider", "contracts", "collection"] as const;

export type TransitionStep = (typeof PROVISION_STEPS)[number];
export type ProviderInstanceAdministrator = Readonly<{ email: string; password: string }>;

export interface OfficialInstanceProvisioningTarget {
    importManifest(profile: OfficialInstanceProfile, execution: ProviderInstanceTransitionExecution): Promise<void>;
    connectProvider(profile: OfficialInstanceProfile, execution: ProviderInstanceTransitionExecution): Promise<void>;
    selectContracts(profile: OfficialInstanceProfile, execution: ProviderInstanceTransitionExecution): Promise<void>;
    installCollection(profile: OfficialInstanceProfile, execution: ProviderInstanceTransitionExecution): Promise<void>;
    initializeAdministrator(
        administrator: ProviderInstanceAdministrator,
        execution: ProviderInstanceTransitionExecution,
    ): Promise<void>;
    release?(): void;
}

export async function executeProvisioningStep(
    target: OfficialInstanceProvisioningTarget,
    profile: OfficialInstanceProfile,
    step: TransitionStep,
    administrator: ProviderInstanceAdministrator | null,
    execution: ProviderInstanceTransitionExecution,
): Promise<void> {
    execution.throwIfLeaseLost();
    if (step === "manifest") {
        return target.importManifest(profile, execution);
    }
    if (step === "provider") {
        return target.connectProvider(profile, execution);
    }
    if (step === "contracts") {
        return target.selectContracts(profile, execution);
    }
    if (step === "collection") {
        return target.installCollection(profile, execution);
    }
    if (!administrator) {
        throw new Error("Provisioning administrator credentials are unavailable");
    }
    return target.initializeAdministrator(administrator, execution);
}
