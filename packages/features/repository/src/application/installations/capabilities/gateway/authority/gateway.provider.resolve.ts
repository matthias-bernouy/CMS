import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    gatewayProviderResolveInputSchema,
    gatewayProviderResolveOutputSchema,
} from "repository/application/installations/schemas/gateway/authority/gateway.provider.resolve";
import { gatewayProviderResolveErrors as errors } from "repository/application/installations/schemas/common/failures";
import { resolveProvider } from "repository/application/installations/core/gateway/authority";
import { control } from "repository/application/installations/core/gateway/requirements";
export const gatewayProviderResolve = defineCapability({
    id: "gateway.provider.resolve",
    description: "gateway provider resolve",
    access: "admin",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/gateway/providers/resolve",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, FORBIDDEN: 403, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: gatewayProviderResolveInputSchema,
    output: gatewayProviderResolveOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        return resolveProvider(services.gateway, input.token);
    },
});
