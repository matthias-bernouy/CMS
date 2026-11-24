import type { EventInitiator } from "@bernouy/cms-gateway/events";
import type { ProviderCapabilityInvocationContext } from "@bernouy/cms-gateway/provider/server";
import type { EventDefinition, EventOwner } from "./definition";
export interface VerifiedEventInitiator {
    readonly initiator: EventInitiator;
    /** Stable keyed identity digest; proof ciphertext may differ between equivalent captures. */
    readonly fingerprint: string;
}
export interface EventInitiators {
    capture(
        context: ProviderCapabilityInvocationContext,
        definition: EventDefinition,
        occurrenceId: string,
    ): Promise<string>;
    verify(
        owner: EventOwner,
        definition: EventDefinition,
        occurrenceId: string,
        proof: string,
    ): Promise<VerifiedEventInitiator>;
    publication(
        context: ProviderCapabilityInvocationContext,
        definition: EventDefinition,
        occurrenceId: string,
        input: { readonly initiatorProof?: string; readonly causeDeliveryId?: string },
    ): Promise<{ readonly proof?: string; readonly causation: readonly string[] }>;
    resolve(
        context: ProviderCapabilityInvocationContext,
        reference: string,
        targetContractId: string,
    ): Promise<{ readonly authority: string; readonly subjectId: string }>;
}
