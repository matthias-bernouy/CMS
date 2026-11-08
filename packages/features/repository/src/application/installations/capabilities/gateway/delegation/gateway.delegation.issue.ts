import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    gatewayDelegationIssueInputSchema,
    gatewayDelegationIssueOutputSchema,
} from "repository/application/installations/schemas/gateway/delegation/gateway.delegation.issue";
import { gatewayDelegationCloseErrors as errors } from "repository/application/installations/schemas/common/failures";
import { issueDelegation } from "repository/application/installations/core/gateway/authority";
import { control } from "repository/application/installations/core/requirements";
export const gatewayDelegationIssue = defineCapability({
    id: "gateway.delegation.issue",
    description: "Control authority only: issue a bounded invocation delegation.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "none" },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/gateway/delegations/issue",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { FORBIDDEN: 403, INVALID_INPUT: 422 },
            },
        },
    ],
    docs: ["overview.md"],
    input: gatewayDelegationIssueInputSchema,
    output: gatewayDelegationIssueOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        return issueDelegation(services.gateway, input.source);
    },
});
