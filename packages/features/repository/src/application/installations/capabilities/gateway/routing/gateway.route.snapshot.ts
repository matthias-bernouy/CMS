import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    gatewayRouteSnapshotInputSchema,
    gatewayRouteSnapshotOutputSchema,
} from "repository/application/installations/schemas/gateway/routing/gateway.route.snapshot";
import { gatewayRouteGetErrors as errors } from "repository/application/installations/schemas/common/failures";
import { requiredGateway, control } from "repository/application/installations/core/gateway/requirements";
import { packGatewayRoute } from "@bernouy/cms-gateway/protocol";
import { InstallationError } from "repository/application/installations/core/errors";

export const gatewayRouteSnapshot = defineCapability({
    id: "gateway.route.snapshot",
    description: "Edge control connection only. Return a current route with exact immutable definition references.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/gateway/route-snapshot",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, CORE_UNAVAILABLE: 503, FORBIDDEN: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: gatewayRouteSnapshotInputSchema,
    output: gatewayRouteSnapshotOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        const gateway = requiredGateway(services.gateway);
        const route = await gateway.routes.resolve(gateway.siteId, input.contractId);
        if (!route) {
            throw new InstallationError("NOT_FOUND");
        }
        return packGatewayRoute(route, input.known);
    },
});
