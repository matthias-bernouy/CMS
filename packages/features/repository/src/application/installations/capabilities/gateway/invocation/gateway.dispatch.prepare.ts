import { gatewayActor } from "repository/application/installations/core/gateway/actors";
import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    gatewayDispatchPrepareInputSchema,
    gatewayDispatchPrepareOutputSchema,
} from "repository/application/installations/schemas/gateway/invocation/gateway.dispatch.prepare";
import { gatewayDispatchPrepareErrors as errors } from "repository/application/installations/schemas/common/failures";
import { required, requiredGateway, control } from "repository/application/installations/core/gateway/requirements";
export const gatewayDispatchPrepare = defineCapability({
    id: "gateway.dispatch.prepare",
    description:
        "Edge control connection only. Resolve the provider identity, issue an optional root delegation and sign one invocation after live authority revalidation.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/gateway/dispatch/prepare",
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
                    REVISION_CONFLICT: 409,
                    INVALID_SELECTION: 422,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: gatewayDispatchPrepareInputSchema,
    output: gatewayDispatchPrepareOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        return required(requiredGateway(services.gateway).invocations.prepare)({
            ...input,
            actor: gatewayActor(input.actor),
        });
    },
});
