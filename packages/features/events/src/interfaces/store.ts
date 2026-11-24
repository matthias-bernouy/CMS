import type { EventMessageContent, DurableEventRecord, SubscriptionOwner } from "@bernouy/cms-gateway/events";
import type { EventDefinition, EventDefinitionSummary, EventReadScope } from "./definition";
import type { EventSubscription } from "./subscription";
export interface EventPage<T> {
    readonly items: readonly T[];
    readonly nextCursor?: string;
}
export type DomainOutboxRecord = DurableEventRecord<EventMessageContent, EventSubscription>;
export interface EventPublication {
    readonly id: string;
    readonly siteId: string;
    readonly definitionId: string;
    readonly occurrenceId: string;
    readonly fingerprint: string;
    readonly acceptedAt: string;
    readonly receiptExpiresAt: number;
    readonly pending: boolean;
    readonly fanout?: {
        readonly snapshot: number;
        readonly routingKeys: readonly string[];
        readonly cursor?: string;
        readonly event: EventMessageContent;
        readonly expiresAt: number;
        readonly batch?: { readonly record: DomainOutboxRecord | null; readonly nextCursor?: string };
    };
}
export interface EventDeliveryStatus {
    readonly deliveryId: string;
    readonly occurrenceId: string;
    readonly subscriptionId: string;
    readonly subscriptionRevision: number;
    readonly state: "pending" | "delivered" | "cancelled" | "failed";
    readonly attempts: number;
    readonly nextAttemptAt?: number;
    readonly failureCode?: string;
}
export interface EventsStore {
    deliveryStatuses(
        owner: SubscriptionOwner,
        cursor: string | undefined,
        limit: number,
        now: number,
    ): Promise<EventPage<EventDeliveryStatus>>;
    putDefinition(record: EventDefinition): Promise<EventDefinition>;
    definition(id: string): Promise<EventDefinition | null>;
    definitions(
        owner: EventReadScope | null,
        cursor: string | undefined,
        limit: number,
    ): Promise<EventPage<EventDefinitionSummary>>;
    retireDefinition(id: string, digest: string): Promise<boolean>;
    putPublication(record: EventPublication): Promise<EventPublication>;
    publication(id: string): Promise<EventPublication | null>;
    pendingPublications(limit: number): Promise<readonly EventPublication[]>;
    stagePublicationBatch(
        publication: EventPublication,
        batch: NonNullable<NonNullable<EventPublication["fanout"]>["batch"]>,
    ): Promise<EventPublication>;
    advancePublication(
        id: string,
        fingerprint: string,
        previous: string | undefined,
        next: string | undefined,
    ): Promise<void>;
    createSubscription(record: EventSubscription): Promise<EventSubscription>;
    subscription(owner: SubscriptionOwner, id: string): Promise<EventSubscription | null>;
    subscriptions(
        owner: SubscriptionOwner,
        cursor: string | undefined,
        limit: number,
    ): Promise<EventPage<EventSubscription>>;
    replaceSubscription(record: EventSubscription, revision: number): Promise<boolean>;
    cancelSubscription(owner: SubscriptionOwner, id: string): Promise<void>;
    subscriptionSnapshot(): Promise<number>;
    matchingSubscriptions(
        definitionId: string,
        limit: number,
        routingKeys: readonly string[],
        snapshot: number,
        cursor?: string,
    ): Promise<EventPage<EventSubscription>>;
}
