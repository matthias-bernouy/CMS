import type { SystemInstallationPlan } from "./installationPlan";
import type { ProviderInstanceTransitionExecution } from "./transitionLease";

export const PROVISION_STEPS = ["manifest", "provider", "contracts", "initialization", "administrator"] as const;
export const REGISTRY_STEPS = ["provider", "contracts"] as const;

export type TransitionStep = (typeof PROVISION_STEPS)[number];
export type ProviderInstanceAdministrator = Readonly<{ email: string; password: string }>;

export interface OfficialInstanceProvisioningTarget {
    importManifest(plan: SystemInstallationPlan, execution: ProviderInstanceTransitionExecution): Promise<void>;
    connectProvider(plan: SystemInstallationPlan, execution: ProviderInstanceTransitionExecution): Promise<void>;
    selectContracts(plan: SystemInstallationPlan, execution: ProviderInstanceTransitionExecution): Promise<void>;
    initializeSetup(plan: SystemInstallationPlan, execution: ProviderInstanceTransitionExecution): Promise<void>;
    initializeAdministrator(
        administrator: ProviderInstanceAdministrator,
        execution: ProviderInstanceTransitionExecution,
    ): Promise<void>;
    release?(): void;
}

export async function executeProvisioningStep(
    target: OfficialInstanceProvisioningTarget,
    plan: SystemInstallationPlan,
    step: TransitionStep,
    administrator: ProviderInstanceAdministrator | null,
    execution: ProviderInstanceTransitionExecution,
): Promise<void> {
    execution.throwIfLeaseLost();
    if (step === "manifest") {
        return target.importManifest(plan, execution);
    }
    if (step === "provider") {
        return target.connectProvider(plan, execution);
    }
    if (step === "contracts") {
        return target.selectContracts(plan, execution);
    }
    if (step === "initialization") {
        return target.initializeSetup(plan, execution);
    }
    if (!administrator) {
        throw new Error("Provisioning administrator credentials are unavailable");
    }
    return target.initializeAdministrator(administrator, execution);
}
