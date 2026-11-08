import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    gatewayInvocationIssueInputSchema,
    gatewayInvocationIssueOutputSchema,
} from "repository/application/installations/schemas/gateway/invocation/gateway.invocation.issue";
import { gatewayInvocationIssueErrors as errors } from "repository/application/installations/schemas/common/failures";
import { requiredGateway, control } from "repository/application/installations/core/requirements";
export const gatewayInvocationIssue = defineCapability({
    id: "gateway.invocation.issue",
    description:
        "Edge control connection only. Issue one short-lived provider invocation token for the current selected route.",
    access: "admin",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/gateway/invocations",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_FOUND: 404,
                    CORE_UNAVAILABLE: 503,
                    FORBIDDEN: 403,
                    RATE_LIMITED: 429,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: gatewayInvocationIssueInputSchema,
    output: gatewayInvocationIssueOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        return requiredGateway(services.gateway).invocations.issue({
            ...input,
            subjectId: input.subjectId ?? undefined,
        });
    },
});
