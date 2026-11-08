import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    gatewayProviderAuthorizeInputSchema,
    gatewayProviderAuthorizeOutputSchema,
} from "repository/application/installations/schemas/gateway/authority/gateway.provider.authorize";
import { gatewayProviderResolveErrors as errors } from "repository/application/installations/schemas/common/failures";
import { authorizeProvider } from "repository/application/installations/core/gateway/authority";
import { control } from "repository/application/installations/core/requirements";
export const gatewayProviderAuthorize = defineCapability({
    id: "gateway.provider.authorize",
    description: "gateway provider authorize",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/gateway/providers/authorize",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, FORBIDDEN: 403, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: gatewayProviderAuthorizeInputSchema,
    output: gatewayProviderAuthorizeOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        return authorizeProvider(services.gateway, input);
    },
});
