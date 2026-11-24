import { z, capabilitiesFor, contractString } from "@bernouy/ulvia-sdk";
import type { EventServices } from "cms-events/interfaces/services";
import { EventDefinitions } from "cms-events/core/definitions";
import { EventsError } from "cms-events/core/errors";
import { namespace, id, command, query, binding } from "./schemas";
const define = capabilitiesFor<EventServices>();
const proof = contractString({ minLength: 1, maxLength: 2048, sensitive: true });
export const capture = define({
    ...command,
    access: "public",
    id: "initiators.capture",
    bindings: [binding("POST", "/initiators/capture")],
    input: z.strictObject({ contractId: namespace, eventType: id, occurrenceId: id }),
    output: z.strictObject({ proof }),
    execute: async ({ services, context, input }) => {
        if (!services.initiators) {
            throw new EventsError("CORE_UNAVAILABLE");
        }
        const owner = await services.authority.owner(context, input.contractId);
        const definition = await new EventDefinitions(services).resolve(owner, input.eventType);
        return { proof: await services.initiators.capture(context, definition, input.occurrenceId) };
    },
});
export const resolve = define({
    ...query,
    id: "initiators.resolve",
    bindings: [binding("QUERY", "/initiators/resolve")],
    input: z.strictObject({ reference: proof, targetContractId: namespace }),
    output: z.strictObject({
        authority: namespace,
        subjectId: contractString({ minLength: 1, maxLength: 256, sensitive: true }),
    }),
    execute: ({ services, context, input }) => {
        if (!services.initiators) {
            throw new EventsError("CORE_UNAVAILABLE");
        }
        return services.initiators.resolve(context, input.reference, input.targetContractId);
    },
});
