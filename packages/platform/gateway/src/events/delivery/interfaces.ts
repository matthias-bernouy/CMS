export interface DeliverySubscription {
    readonly id: string;
    readonly revision: number;
    readonly owner: { readonly consumerContractId: string };
}
export interface DeliveryPayload {
    readonly payloadJson?: string;
}
export interface DurableDeliveryIntent<S extends DeliverySubscription> {
    readonly id: string;
    readonly subscription: S;
    readonly state: "pending" | "delivered" | "cancelled" | "failed";
    readonly attempts: number;
    readonly dueAt: number;
    readonly failureCode?: string;
}
export interface DurableEventRecord<C extends DeliveryPayload, S extends DeliverySubscription> {
    readonly id: string;
    readonly siteId: string;
    readonly fingerprint: string;
    readonly event: C;
    readonly deliveries: readonly DurableDeliveryIntent<S>[];
    readonly expiresAt: number;
    readonly receiptExpiresAt?: number;
    readonly lease?: { readonly token: string; readonly expiresAt: number };
}
export interface DurableEventStore<C extends DeliveryPayload, S extends DeliverySubscription> {
    publish(record: DurableEventRecord<C, S>): Promise<void>;
    claim(siteId: string, now: number, token: string, leaseUntil: number): Promise<DurableEventRecord<C, S> | null>;
    renew(siteId: string, id: string, token: string, now: number, leaseUntil: number): Promise<boolean>;
    finish(siteId: string, id: string, token: string, now: number, intent: DurableDeliveryIntent<S>): Promise<boolean>;
}
export interface DurableDeliveryPolicy {
    readonly leaseMs: number;
    readonly retryMs: number;
    readonly maxAttempts: number | null;
    readonly maxRetryMs?: number;
    readonly receiptRetentionMs?: number;
    readonly retentionMs: number;
    readonly maxFanout: number;
}
