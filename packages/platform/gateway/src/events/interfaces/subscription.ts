/** Installation identity is authoritative; contract IDs isolate logical consumers within one Provider. */
export interface SubscriptionOwner {
    readonly siteId: string;
    readonly installationId: string;
    readonly consumerContractId: string;
}
export interface SubscriptionTarget {
    readonly installationId: string;
    readonly contractId: string;
    readonly version: string;
    readonly digest: string;
    readonly capabilityId: string;
    readonly endpoint: string;
    readonly accountId: string;
    readonly instanceId: string;
}
