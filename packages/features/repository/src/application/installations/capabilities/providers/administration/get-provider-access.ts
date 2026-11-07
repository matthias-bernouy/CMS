import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    getProviderAccessInputSchema,
    getProviderAccessOutputSchema,
} from "repository/application/installations/schemas/providers/administration/get-provider-access";
import { approveProviderConnectionErrors as errors } from "repository/application/installations/schemas/common/failures";
import { administration } from "repository/application/installations/core/providers/administration";
import { actor } from "repository/application/installations/core/gateway/requirements";
export const getProviderAccess = defineCapability({
    id: "get-provider-access",
    description: "get provider access",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/providers/access",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, FORBIDDEN: 403, REVISION_CONFLICT: 409, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: getProviderAccessInputSchema,
    output: getProviderAccessOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        actor(context);
        return administration(services).access(input.installationId);
    },
});
