import { CapabilityGateway } from "@bernouy/cms-gateway";
import type { GatewayTransportRequest, GatewayTransportResponse } from "@bernouy/cms-gateway";
import { InMemoryGatewayCommandAuditStore } from "@bernouy/cms-gateway/audit";
import { gatewayRoute, NOW } from "../../fixtures";

export const context = { siteId: "site-a", actor: { kind: "anonymous" as const } };
export const invocation = { ...context, contractId: "catalog", capabilityId: "item.list", input: {} };
export const mcp = {
    id: "agent",
    transport: "mcp",
    tool: { name: "search_items", title: "Search items", description: "Find matching catalogue items." },
};
export function http(id = "rest", path = "/v1/items") {
    return {
        id,
        transport: "http",
        method: "GET",
        path,
        input: { query: { term: "term" } },
        response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: { NOT_FOUND: 404 } },
    };
}
export async function scope(
    bindings: readonly Record<string, unknown>[],
    options: Parameters<typeof gatewayRoute>[0] = {},
) {
    const route = await gatewayRoute({ ...options, bindings });
    const sent: GatewayTransportRequest[] = [];
    const audit = new InMemoryGatewayCommandAuditStore();
    let response: GatewayTransportResponse = { output: { items: ["found"] } };
    const gateway = new CapabilityGateway({
        routes: { resolve: async () => route, isCurrent: async () => true },
        authorize: async () => true,
        now: () => NOW,
        commandAudit: audit,
        transport: {
            async send(request) {
                sent.push(request);
                return response;
            },
        },
    });
    return {
        route,
        gateway,
        sent,
        audit,
        respond(value: GatewayTransportResponse) {
            response = value;
        },
    };
}
