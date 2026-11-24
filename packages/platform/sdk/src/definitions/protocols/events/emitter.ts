import type { EventDefinition, EventPayload } from "ulvia-sdk/interfaces/events";
import type { FeatureDefinition } from "ulvia-sdk/interfaces/features";
import type { DomainEventPublication } from "./producer";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";

type OwnEvents<Feature> = Feature extends { readonly events: readonly (infer Event extends EventDefinition)[] }
    ? Event
    : never;
type Events<Feature> =
    | OwnEvents<Feature>
    | (Feature extends { readonly extends: infer Parent } ? Events<Parent> : never);

type SelectedEvent<F, Id> = Extract<Events<F>, { readonly id: Id }>;
/** Capture event identity only. The host validates admitted schemas; the caller supplies transactional persistence. */
export function eventsFor<Feature extends FeatureDefinition>(
    feature: Feature,
    publisher: {
        enqueue(key: string, publication: DomainEventPublication): Promise<void>;
        capture?(input: { contractId: string; eventType: string; occurrenceId: string }): Promise<string>;
    },
) {
    const owners = new Map<string, string>();
    const seen = new Set<FeatureDefinition>();
    let current: FeatureDefinition | undefined = feature;
    while (current) {
        if (seen.has(current) || seen.size >= 24) {
            throw new TypeError("Invalid event contract lineage");
        }
        seen.add(current);
        for (const event of current.events ?? []) {
            if (owners.has(event.id)) {
                throw new TypeError("Cannot redeclare inherited event");
            }
            owners.set(event.id, current.contractId);
        }
        current = current.extends;
    }
    const identity = (eventType: string, occurrenceId: string) => {
        if (!owners.has(eventType) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(occurrenceId)) {
            throw new TypeError("Invalid event identity");
        }
        return owners.get(eventType)!;
    };
    return {
        async capture<Id extends Events<Feature>["id"] & string>(eventType: Id, occurrenceId: string): Promise<string> {
            const contractId = identity(eventType, occurrenceId);
            if (!publisher.capture) {
                throw new TypeError("The host must provide a verified initiator capture port");
            }
            return publisher.capture({ contractId, eventType, occurrenceId });
        },
        async emit<Id extends Events<Feature>["id"] & string>(
            eventType: Id,
            occurrenceId: string,
            payload: EventPayload<SelectedEvent<Feature, Id>>,
            options?: { readonly causeDeliveryId?: string; readonly initiatorProof?: string },
        ): Promise<void> {
            const contractId = identity(eventType, occurrenceId);
            if (
                options?.initiatorProof !== undefined &&
                (!options.initiatorProof.length ||
                    options.initiatorProof.length > 2048 ||
                    options.causeDeliveryId !== undefined)
            ) {
                throw new TypeError("Invalid initiator proof");
            }
            const payloadJson = canonicalizeIJson(payload);
            const publication = {
                contractId,
                eventType,
                occurrenceId,
                payloadJson,
                ...(options?.initiatorProof === undefined ? {} : { initiatorProof: options.initiatorProof }),
                ...(options?.causeDeliveryId === undefined ? {} : { causeDeliveryId: options.causeDeliveryId }),
            };
            const bytes = new TextEncoder().encode(canonicalizeIJson({ contractId, eventType, occurrenceId }));
            const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
            const key = Array.from(digest, (value) => value.toString(16).padStart(2, "0")).join("");
            await publisher.enqueue(key, publication);
        },
    };
}
