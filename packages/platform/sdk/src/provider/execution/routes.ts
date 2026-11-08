import type { ProviderCapabilityInvocationContext, ProviderRoute } from "@bernouy/cms-gateway/provider/server";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";

export function selectedRoute(
    routes: readonly ProviderRoute[],
    contractId: string,
    capabilityId: string,
    context: ProviderCapabilityInvocationContext,
    claims: Pick<ProviderInvocationClaims, "contractId" | "contractVersion">,
    stored = false,
) {
    const request = context.http?.transportRequest;
    const bindingId = context.invocation?.bindingId;
    if (stored && !bindingId) {
        throw new TypeError("Durable operation requires its receiver-selected binding evidence");
    }
    if (!request && !stored) {
        throw new TypeError("Provider handler requires its trusted HTTP request context");
    }
    const path = request ? new URL(request.url).pathname : undefined;
    const matches = routes.filter(
        (route) =>
            (route.dispatchContractId ?? route.contractId) === contractId &&
            route.contractId === claims.contractId &&
            route.contractVersion === claims.contractVersion &&
            route.capability.id === capabilityId &&
            (bindingId === undefined || route.capability.binding.id === bindingId) &&
            (request ? route.match(request.method, path!) !== null : route.capability.binding.id === bindingId),
    );
    if (matches.length !== 1) {
        throw new TypeError("No admitted binding matches this invocation");
    }
    return matches[0]!;
}
