import type { EventInitiators } from "./initiators";
import type { ResolvedContract } from "@bernouy/ulvia-contracts";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type {
    DurableEventStore,
    EventMessageContent,
    DurableDeliveryPolicy,
    SubscriptionOwner,
    SubscriptionTarget,
} from "@bernouy/cms-gateway/events";
import type { EventOwner, EventReadScope, EventDefinition } from "./definition";
import type { EventsStore } from "./store";
import type { EventSubscription, EventSubscriptionConfiguration } from "./subscription";
export interface EventsAuthority {
    contract(owner: EventOwner): Promise<ResolvedContract>;
    schema(
        definition: EventDefinition,
        resolverId: string,
        input: { readonly selectorJson: string; readonly version?: string },
    ): Promise<unknown>;
    source(context: ProviderCapabilityInvocationContext, namespace: string): Promise<EventOwner>;
    owner(context: ProviderCapabilityInvocationContext, namespace: string): Promise<EventOwner>;
    reader(context: ProviderCapabilityInvocationContext, namespace?: string): Promise<EventReadScope | null>;
    subscriber(context: ProviderCapabilityInvocationContext, consumerContractId: string): Promise<SubscriptionOwner>;
    assertSource(definition: EventDefinition): Promise<void>;
    receiver(owner: SubscriptionOwner, configuration: EventSubscriptionConfiguration): Promise<SubscriptionTarget>;
    ancestry(context: ProviderCapabilityInvocationContext, causeDeliveryId?: string): Promise<readonly string[]>;
}
export interface EventServices {
    readonly initiators?: EventInitiators;
    readonly store: EventsStore;
    readonly outbox: DurableEventStore<EventMessageContent, EventSubscription>;
    readonly authority: EventsAuthority;
    readonly policy: DurableDeliveryPolicy;
    readonly now: () => number;
    readonly fingerprint: (value: unknown) => string;
}
