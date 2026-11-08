import { defineCapability } from "cms-repository/application/installations/capabilities/policy/define";
import {
    previewProviderConnectionInputSchema,
    previewProviderConnectionOutputSchema,
} from "cms-repository/application/installations/schemas/providers/administration/preview-provider-connection";
import { approveProviderConnectionErrors as errors } from "cms-repository/application/installations/schemas/common/failures";
import { administration } from "cms-repository/application/installations/core/providers/administration";
import { actor } from "cms-repository/application/installations/core/requirements";
export const previewProviderConnection = defineCapability({
    id: "preview-provider-connection",
    description: "preview provider connection",
    access: "admin",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/providers/preview",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, FORBIDDEN: 403, REVISION_CONFLICT: 409, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: previewProviderConnectionInputSchema,
    output: previewProviderConnectionOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        const actorId = actor(context);
        return administration(services).preview(input, actorId);
    },
});
