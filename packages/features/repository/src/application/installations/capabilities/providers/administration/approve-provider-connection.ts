import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    approveProviderConnectionInputSchema,
    approveProviderConnectionOutputSchema,
} from "repository/application/installations/schemas/providers/administration/approve-provider-connection";
import { approveProviderConnectionErrors as errors } from "repository/application/installations/schemas/common/failures";
import { administration } from "repository/application/installations/core/providers/administration";
import { actor } from "repository/application/installations/core/requirements";
export const approveProviderConnection = defineCapability({
    id: "approve-provider-connection",
    description: "approve provider connection",
    access: "admin",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/providers/approve",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, FORBIDDEN: 403, REVISION_CONFLICT: 409, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: approveProviderConnectionInputSchema,
    output: approveProviderConnectionOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        const actorId = actor(context);
        return administration(services).approve(input.ticket, actorId);
    },
});
