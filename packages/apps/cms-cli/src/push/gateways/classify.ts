import type { LocalGateway } from "./scan";
import type { PageStatus } from "../shared/recap";
import type { PushState } from "../shared/state";

/** One row of `GET /api/gateway-provider/list`. */
export type RemoteGatewayItem = { urn: string; id: string; name: string; endpointCount: number };

export type ClassifiedGateway = {
    gateway: LocalGateway;
    status:  PageStatus;
};

/**
 * Diff local gateways against the remote list + last-pushed state.
 *
 * V1 mirrors the snippets push: ADDITIVE (create new urns, update changed
 * ones, skip unchanged). Remote-only providers are left untouched — no push
 * resource deletes. No remote-hash conflict detection yet (`--force` re-pushes
 * everything regardless of state).
 */
export function classifyGateways(
    local:      LocalGateway[],
    remoteUrns: Set<string>,
    state:      PushState,
    force:      boolean,
): ClassifiedGateway[] {
    return local.map(gateway => {
        if (!remoteUrns.has(gateway.urn)) return { gateway, status: "new" };
        const stateHash = state.entities[`gateway:${gateway.urn}`]?.hash;
        const unchanged = !force && stateHash === gateway.hash;
        return { gateway, status: unchanged ? "unchanged" : "update" };
    });
}
