import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import { gatewayActor } from "repository/application/installations/core/gateway/actors";
import { InstallationError } from "repository/application/installations/core/errors";
import { requiredGateway, control } from "repository/application/installations/core/gateway/requirements";
import { gatewayMcpAuthorizedInputSchema } from "repository/application/installations/schemas/gateway/routing/gateway.mcp.authorized";
import { resolveMcpContract } from "repository/application/installations/core/gateway/mcpIndex";
import { packGatewayContract } from "@bernouy/cms-gateway/protocol";
import { gatewayMcpResolve } from "./gateway.mcp.resolve";

export const gatewayMcpAuthorized = defineCapability({
    access: gatewayMcpResolve.access,
    behavior: gatewayMcpResolve.behavior,
    output: gatewayMcpResolve.output,
    errors: gatewayMcpResolve.errors,
    docs: gatewayMcpResolve.docs,
    id: "gateway.mcp.authorized",
    description:
        "Edge control only. Authorize the current user and resolve one selected MCP tool without a full installation listing.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/gateway/mcp/authorized",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, CORE_UNAVAILABLE: 503, FORBIDDEN: 403 },
            },
        },
    ],
    input: gatewayMcpAuthorizedInputSchema,
    execute: async ({ services, input, context }) => {
        control(context);
        const gateway = requiredGateway(services.gateway);
        if (!gateway.authorizeMcpCatalogue) {
            throw new InstallationError("CORE_UNAVAILABLE");
        }
        try {
            await gateway.authorizeMcpCatalogue(gatewayActor(input.actor));
        } catch (error) {
            const record = error && typeof error === "object" ? error : undefined;
            throw new InstallationError(
                record &&
                    (("status" in record && record.status === 403) ||
                        ("code" in record && record.code === "not_authorized"))
                    ? "FORBIDDEN"
                    : "CORE_UNAVAILABLE",
                error,
            );
        }
        const selected = await gateway.selections.get(gateway.siteId);
        const ids = [...new Set(selected?.plan.selections.map(({ contractId }) => contractId) ?? [])];
        if (ids.length > 256) {
            throw new InstallationError("CORE_UNAVAILABLE");
        }
        return packGatewayContract(await resolveMcpContract(gateway, ids, input.toolName), input.known);
    },
});
