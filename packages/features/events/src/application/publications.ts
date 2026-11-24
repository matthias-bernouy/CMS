import { EventsError } from "cms-events/core/errors";
import { z, capabilitiesFor, contractString } from "@bernouy/ulvia-sdk";
import type { EventServices } from "cms-events/interfaces/services";
import { EventPublications } from "cms-events/core/publications";
import { EventDefinitions } from "cms-events/core/definitions";
import { id, hash, json, namespace, command, binding } from "./schemas";
const define = capabilitiesFor<EventServices>();
export const publish = define({
    ...command,
    id: "events.publish",
    bindings: [binding("POST", "/events/publish")],
    input: z.strictObject({
        contractId: namespace,
        eventType: id,
        occurrenceId: id,
        payloadJson: json,
        causeDeliveryId: id.optional(),
        initiatorProof: contractString({ minLength: 1, maxLength: 2048, sensitive: true }).optional(),
    }),
    output: z.strictObject({ occurrenceId: hash, accepted: z.boolean() }),
    execute: async ({ services, context, input }) => {
        const owner = await services.authority.owner(context, input.contractId);
        const definition = await new EventDefinitions(services).resolve(owner, input.eventType);
        if (input.initiatorProof && !services.initiators) {
            throw new EventsError("CORE_UNAVAILABLE");
        }
        let prepared: Promise<{ proof?: string; causation: readonly string[] }> | undefined;
        const provenance = (): Promise<{ proof?: string; causation: readonly string[] }> =>
            (prepared ??= services.initiators
                ? services.initiators.publication(context, definition, input.occurrenceId, input)
                : services.authority.ancestry(context, input.causeDeliveryId).then((causation) => ({ causation })));
        return new EventPublications(services).publish(
            owner,
            definition.id,
            input.occurrenceId,
            input.payloadJson,
            async () => (await provenance()).causation,
            async () => (await provenance()).proof,
        );
    },
});
