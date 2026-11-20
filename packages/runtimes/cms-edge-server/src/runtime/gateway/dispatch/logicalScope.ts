import { CapabilityGateway } from "@bernouy/cms-gateway";
import type { CapabilityGatewayOptions, GatewayRoute } from "@bernouy/cms-gateway";
import type { CapabilityQueryHandlerConfig } from "@bernouy/cms-gateway/http/handlers";

/** Retain only one target promise in the request closure; no actor or authority survives the request. */
export function logicalInvocationScope(
    options: CapabilityGatewayOptions,
    contractId: string,
    load: () => Promise<GatewayRoute | null>,
): Pick<CapabilityQueryHandlerConfig, "invoker" | "resolveCapability"> {
    let pending: Promise<GatewayRoute | null> | undefined;
    const target = () => (pending ??= load());
    const routes = {
        resolve: (siteId: string, id: string) =>
            siteId === "default" && id === contractId ? target() : options.routes.resolve(siteId, id),
        isCurrent: (route: GatewayRoute) => options.routes.isCurrent(route),
    };
    return {
        invoker: new CapabilityGateway({ ...options, routes }),
        resolveCapability: async (id, capabilityId) => {
            if (id !== contractId) {
                throw new TypeError("Logical request scope cannot resolve another contract");
            }
            const route = await target();
            const capability = route?.requestedRelease.admission.release.capabilities.find(
                (item) => item.id === capabilityId,
            );
            return capability
                ? {
                      access: capability.access,
                      effect: capability.behavior.effect,
                      ...(capability.behavior.effect === "command"
                          ? { idempotency: capability.behavior.idempotency }
                          : {}),
                      outputType: capability.output.type,
                  }
                : null;
        },
    };
}
