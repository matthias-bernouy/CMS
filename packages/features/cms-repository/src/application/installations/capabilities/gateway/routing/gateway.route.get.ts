import { defineCapability } from "cms-repository/application/installations/capabilities/policy/define";
import { capabilitiesDescribeInputSchema } from "cms-repository/application/installations/schemas/discovery/capabilities.describe";
import { gatewayRouteGetOutputSchema } from "cms-repository/application/installations/schemas/gateway/routing/gateway.route.get";
import { gatewayRouteGetErrors as errors } from "cms-repository/application/installations/schemas/common/failures";
import { route } from "cms-repository/application/installations/core/gateway/routing";
import { requiredGateway, control } from "cms-repository/application/installations/core/requirements";
export const gatewayRouteGet = defineCapability({
    id: "gateway.route.get",
    description: "Edge control connection only. Return the complete selected Gateway route snapshot for one contract.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/gateway/route",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, CORE_UNAVAILABLE: 503, FORBIDDEN: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: capabilitiesDescribeInputSchema,
    output: gatewayRouteGetOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        return route(requiredGateway(services.gateway), input.contractId);
    },
});
