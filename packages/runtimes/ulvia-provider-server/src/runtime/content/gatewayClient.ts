import type { ProviderConnections } from "@bernouy/cms-gateway/provider/node";
import type { ProviderCapabilityClient } from "@bernouy/cms-gateway/provider";

/** All downstream capabilities use the authenticated CMS connection through Edge. */
export function contentGatewayClient(options: {
    connections: ProviderConnections;
    context: Readonly<{ siteId: string; connectionId?: string }>;
    siteId: string;
}): ProviderCapabilityClient {
    if (options.context.siteId !== options.siteId) {
        throw new Error("Content instance scope is invalid");
    }
    if (!options.context.connectionId) {
        throw new Error("Content CMS connection is unavailable");
    }
    return options.connections.client(options.context.connectionId, true);
}
