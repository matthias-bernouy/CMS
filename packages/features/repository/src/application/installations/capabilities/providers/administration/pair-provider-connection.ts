import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    pairProviderConnectionInputSchema,
    pairProviderConnectionOutputSchema,
} from "repository/application/installations/schemas/providers/administration/pair-provider-connection";
import { approveProviderConnectionErrors as errors } from "repository/application/installations/schemas/common/failures";
import { administration } from "repository/application/installations/core/providers/administration";
import { actor } from "repository/application/installations/core/gateway/requirements";
export const pairProviderConnection = defineCapability({
    id: "pair-provider-connection",
    description:
        "Pair or rotate one approved Provider connection. Outgoing capabilities are derived from its approved manifest requirements.",
    access: "admin",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/providers/pair",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, FORBIDDEN: 403, REVISION_CONFLICT: 409, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: pairProviderConnectionInputSchema,
    output: pairProviderConnectionOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        const actorId = actor(context);
        return administration(services).pair({ ...input, rotate: input.rotate === true }, actorId);
    },
});
