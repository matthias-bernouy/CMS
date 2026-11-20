import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    gatewayMcpResolveInputSchema,
    gatewayMcpResolveOutputSchema,
} from "repository/application/installations/schemas/gateway/routing/gateway.mcp.resolve";
import { gatewayRouteGetErrors as errors } from "repository/application/installations/schemas/common/failures";
import { requiredGateway, control } from "repository/application/installations/core/gateway/requirements";
import { packGatewayContract } from "@bernouy/cms-gateway/protocol";
import { resolveMcpContract } from "repository/application/installations/core/gateway/mcpIndex";

export const gatewayMcpResolve = defineCapability({
    id: "gateway.mcp.resolve",
    description:
        "Edge control connection only. Return the exact selected contract for one MCP tool after full catalogue identity validation.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/gateway/mcp/resolve",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, CORE_UNAVAILABLE: 503, FORBIDDEN: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: gatewayMcpResolveInputSchema,
    output: gatewayMcpResolveOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        control(context);
        const gateway = requiredGateway(services.gateway);
        return packGatewayContract(await resolveMcpContract(gateway, input.contractIds, input.toolName), input.known);
    },
});
