import type { SubscriptionOwner, SubscriptionTarget } from "@bernouy/cms-gateway/events";
export interface EventSubscriptionConfiguration {
    readonly definitionId: string;
    readonly definitionDigest: string;
    readonly filterJson?: string;
    readonly enabled: boolean;
    readonly delivery: { readonly contractId: string; readonly capabilityId: string };
}
export interface EventSubscription extends EventSubscriptionConfiguration {
    readonly id: string;
    readonly owner: SubscriptionOwner;
    readonly target: SubscriptionTarget;
    readonly revision: number;
    readonly filterKey: string;
    readonly deleted: boolean;
    readonly creationFingerprint: string;
    readonly createdAt: string;
    readonly updatedAt: string;
}
