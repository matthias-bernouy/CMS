import { defineCapability } from "cms-repository/application/installations/capabilities/policy/define";
import {
    gatewayDelegationCheckInputSchema,
    gatewayDelegationCheckOutputSchema,
} from "cms-repository/application/installations/schemas/gateway/delegation/gateway.delegation.check";
import { gatewayDelegationCloseErrors as errors } from "cms-repository/application/installations/schemas/common/failures";
import { checkDelegation } from "cms-repository/application/installations/core/gateway/authority";
import { control } from "cms-repository/application/installations/core/requirements";
export const gatewayDelegationCheck = defineCapability({
    id: "gateway.delegation.check",
    description: "Control authority only: check a bounded invocation delegation.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/gateway/delegations/check",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { FORBIDDEN: 403, INVALID_INPUT: 422 },
            },
        },
    ],
    docs: ["overview.md"],
    input: gatewayDelegationCheckInputSchema,
    output: gatewayDelegationCheckOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        return checkDelegation(services.gateway, input.target);
    },
});
