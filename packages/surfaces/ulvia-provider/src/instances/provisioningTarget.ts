import type { SystemInstallationPlan } from "./installationPlan";
import type { ProviderInstanceTransitionExecution } from "./transitionLease";

export const PROVISION_STEPS = ["manifest", "provider", "contracts", "initialization", "administrator"] as const;
export const REGISTRY_STEPS = ["provider", "contracts"] as const;
export const SYSTEM_UPGRADE_STEPS = ["manifest", "provider", "contracts"] as const;

/** A system release switch preserves every enabled family, including Registry. */
export function assertSystemUpgrade(source: SystemInstallationPlan, target: SystemInstallationPlan): void {
    if (
        source.manifest.providerId !== target.manifest.providerId ||
        compareSemVer(target.manifest.version, source.manifest.version) < 0 ||
        source.contracts.length !== target.contracts.length ||
        new Set(target.contracts.map(({ contractId }) => contractId)).size !== target.contracts.length ||
        source.contracts.some((before) => {
            const after = target.contracts.find(({ contractId }) => contractId === before.contractId);
            return !after || compareSemVer(after.version, before.version) < 0;
        })
    ) {
        throw new Error("System upgrade must retain enabled contract families and cannot downgrade releases");
    }
}

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
import { compareSemVer } from "@bernouy/ulvia-contracts/compatibility";
