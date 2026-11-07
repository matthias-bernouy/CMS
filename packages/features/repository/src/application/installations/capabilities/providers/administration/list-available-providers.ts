import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { emptyInputSchema } from "repository/application/installations/schemas/common/input";
import { listAvailableProvidersOutputSchema } from "repository/application/installations/schemas/providers/administration/list-available-providers";
import { approveProviderConnectionErrors as errors } from "repository/application/installations/schemas/common/failures";
import { administration, availableProviders } from "repository/application/installations/core/providers/administration";
import { actor } from "repository/application/installations/core/gateway/requirements";
export const listAvailableProviders = defineCapability({
    id: "list-available-providers",
    description: "list available providers",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/providers/catalogue",
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, FORBIDDEN: 403, REVISION_CONFLICT: 409, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: emptyInputSchema,
    output: listAvailableProvidersOutputSchema,
    errors,
    execute: async ({ services, context }) => {
        actor(context);
        return availableProviders(administration(services));
    },
});
