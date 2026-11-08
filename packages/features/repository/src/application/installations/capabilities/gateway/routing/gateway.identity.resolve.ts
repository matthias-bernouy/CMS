import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    gatewayIdentityResolveInputSchema,
    gatewayIdentityResolveOutputSchema,
} from "repository/application/installations/schemas/gateway/routing/gateway.identity.resolve";
import { gatewayIdentityResolveErrors as errors } from "repository/application/installations/schemas/common/failures";
import { resolveIdentity } from "repository/application/installations/core/gateway/routing";
import { requiredGateway, control } from "repository/application/installations/core/requirements";
export const gatewayIdentityResolve = defineCapability({
    id: "gateway.identity.resolve",
    description:
        "Edge control connection only. Resolve or create the stable provider-scoped alias for one CMS subject.",
    access: "admin",
    behavior: { effect: "command", idempotency: "natural", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/gateway/identity",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503, FORBIDDEN: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: gatewayIdentityResolveInputSchema,
    output: gatewayIdentityResolveOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        return resolveIdentity(requiredGateway(services.gateway), input);
    },
});
