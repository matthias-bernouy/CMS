import { defineCapability } from "cms-repository/application/installations/capabilities/policy/define";
import {
    gatewayProviderPrepareInputSchema,
    gatewayProviderPrepareOutputSchema,
} from "cms-repository/application/installations/schemas/gateway/invocation/gateway.provider.prepare";
import { gatewayDispatchPrepareErrors as errors } from "cms-repository/application/installations/schemas/common/failures";
import { required, requiredGateway, control } from "cms-repository/application/installations/core/requirements";
export const gatewayProviderPrepare = defineCapability({
    id: "gateway.provider.prepare",
    description:
        "Authenticate one opaque Provider credential and prepare its exact machine invocation through the instance authority. Business dispatch remains separate.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/gateway/providers/prepare",
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
    input: gatewayProviderPrepareInputSchema,
    output: gatewayProviderPrepareOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        return required(requiredGateway(services.gateway).invocations.prepareProvider)(input);
    },
});
