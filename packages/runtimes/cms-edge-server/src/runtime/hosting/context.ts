import type { RuntimeEnv } from "../../runtimeEnv";
import type { EdgeRoute } from "@bernouy/hosting/routing";
import type { RoutingClient } from "./client/RoutingClient";
import { RouteLease } from "./client/RouteLease";
import { ResponseCache } from "../resources/cache/ResponseCache";
import { commandCacheEffect, commandCacheTags } from "../resources/cache/commandPolicy";
import { InstallationsProviderTransport } from "../gateway/InstallationsProviderTransport";
import { fetchInstallationsProviderReport, installationsControlContract } from "../gateway/control";
import { ControlProviderClient } from "../gateway/ControlProviderClient";
import { createEdgeGateway } from "../gateway/createEdgeGateway";
import { createTenantEdge } from "../mountEdge";
import { createEdgeDiagnostics, connectEdgeDiagnostics } from "../diagnostics";

export async function createTenantContext(env: RuntimeEnv, route: EdgeRoute, client: Pick<RoutingClient, "resolve">) {
    const lease = new RouteLease(route, client);
    let resourceRevision = route.resourceRevision;
    const diagnostics = createEdgeDiagnostics(
        { MODE: env.MODE },
        { instanceId: route.instanceId, origin: route.origin },
    );
    const { logger } = diagnostics;
    const cache = new ResponseCache({
        enabled: env.CMS_EDGE_RESPONSE_CACHE,
        validatedRevision: () => resourceRevision,
        maxBytes: 2 * 1024 * 1024,
        maxEntryBytes: 512 * 1024,
        maxEntries: 128,
        maxPending: 8,
        maxWaiters: 32,
        event: (outcome) => logger.debug("edge.resource.cache", { outcome }),
    });
    try {
        const transport = new InstallationsProviderTransport(
            env.CMS_HOSTING_PROVIDER_URL,
            () => lease.token(),
            fetch,
            () => lease.refresh(),
        );
        const report = await fetchInstallationsProviderReport(transport);
        if (report.instanceId !== route.instanceId || report.account.id !== route.instanceId) {
            throw new Error("The Provider report does not match the resolved instance");
        }
        const gateway = createEdgeGateway(
            new ControlProviderClient(transport, logger, installationsControlContract(report)),
            logger,
            (contractId, capabilityId) => {
                if (commandCacheEffect(contractId, capabilityId) !== "neutral") {
                    cache.purge(commandCacheTags(contractId));
                }
            },
        );
        await connectEdgeDiagnostics(diagnostics, gateway);
        const edge = createTenantEdge({ env: { ...env, CMS_PUBLIC_URL: route.origin }, gateway, logger, cache });
        return {
            handle: edge.handle,
            update: (current: EdgeRoute) => {
                lease.update(current);
                if (current.resourceRevision !== resourceRevision) {
                    cache.purge();
                    resourceRevision = current.resourceRevision;
                }
            },
            close: async () => {
                await diagnostics.collector.close();
                cache.purge();
            },
        };
    } catch (error) {
        await diagnostics.collector.close();
        cache.purge();
        throw error;
    }
}
