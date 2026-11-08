/** Exact admitted system resources; initial provisioning reads the image snapshot. Collections stay separate. */
export type SystemInstallationPlan = Readonly<{
    manifest: Readonly<{ providerId: string; version: string; digest: string }>;
    contracts: readonly Readonly<{ contractId: string; version: string; digest: string }>[];
}>;
export interface SystemInstallationSource {
    current(): Promise<SystemInstallationPlan>;
}
import type { ProviderInstanceRecord } from "./types";

export type SystemUpgradeInput = Readonly<{
    expectedRevision: number;
    administratorSub: string;
    manifestDigest: string;
}>;

export type SystemUpgradeReview = Readonly<{
    expectedRevision: number;
    source: SystemInstallationPlan;
    target: SystemInstallationPlan;
    planDigest: string;
}>;

export interface SystemUpgradeOperations {
    review(instance: ProviderInstanceRecord, input: SystemUpgradeInput): Promise<SystemUpgradeReview>;
    apply(
        instance: ProviderInstanceRecord,
        input: SystemUpgradeInput & { planDigest: string },
    ): Promise<ProviderInstanceRecord>;
    resume(instance: ProviderInstanceRecord, administratorSub: string): Promise<ProviderInstanceRecord>;
}
