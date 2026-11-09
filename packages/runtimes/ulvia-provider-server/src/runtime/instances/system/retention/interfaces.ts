import type { ProviderInstanceRecord, InstanceTransitionRecord, SystemInstallationPlan } from "@bernouy/ulvia-provider";

export interface RetentionRecords {
    readonly instances: AsyncIterable<ProviderInstanceRecord>;
    transitions(instanceId?: string): AsyncIterable<InstanceTransitionRecord>;
    hasUnstagedUpgrade(instanceId: string): Promise<boolean>;
}
export interface RetentionReader {
    assertPlan(instance: ProviderInstanceRecord, plan: SystemInstallationPlan): Promise<void>;
    required(
        instance: ProviderInstanceRecord,
        targetNotAdmitted: boolean,
    ): Promise<
        readonly {
            contractId: string;
            version: string;
            digest: string;
            location: string;
        }[]
    >;
}
