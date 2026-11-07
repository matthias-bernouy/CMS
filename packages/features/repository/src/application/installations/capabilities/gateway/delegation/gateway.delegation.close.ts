import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { gatewayDelegationCloseInputSchema } from "repository/application/installations/schemas/gateway/delegation/gateway.delegation.close";
import { gatewayAuditAppendOutputSchema } from "repository/application/installations/schemas/gateway/routing/gateway.audit.append";
import { gatewayDelegationCloseErrors as errors } from "repository/application/installations/schemas/common/failures";
import { closeDelegation } from "repository/application/installations/core/gateway/authority";
import { control } from "repository/application/installations/core/gateway/requirements";
export const gatewayDelegationClose = defineCapability({
    id: "gateway.delegation.close",
    description: "Control authority only: close a bounded invocation delegation.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "none" },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/gateway/delegations/close",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { FORBIDDEN: 403, INVALID_INPUT: 422 },
            },
        },
    ],
    docs: ["overview.md"],
    input: gatewayDelegationCloseInputSchema,
    output: gatewayAuditAppendOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        return closeDelegation(services.gateway, input.context);
    },
});
