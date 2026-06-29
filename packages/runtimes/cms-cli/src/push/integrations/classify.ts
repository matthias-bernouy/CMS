import type { LocalIntegration } from "./scan";
import type { PageStatus } from "../shared/recap";
import type { PushState } from "../shared/state";

/** One row of `GET /api/integrations/instances`. */
export type RemoteIntegrationItem = { id: string; kind: string; label: string };

export type ClassifiedIntegration = {
    integration: LocalIntegration;
    status:      PageStatus;
};

/**
 * Diff local integrations against the remote instance list + last-pushed state.
 *
 * V1 mirrors the snippets push: ADDITIVE (create new instances, rerun changed
 * ones, skip unchanged). Remote-only instances are left untouched — no push
 * resource deletes. No remote-hash conflict detection yet (`--force` re-runs
 * everything regardless of state).
 */
export function classifyIntegrations(
    local:     LocalIntegration[],
    remoteIds: Set<string>,
    state:     PushState,
    force:     boolean,
): ClassifiedIntegration[] {
    return local.map(integration => {
        if (!remoteIds.has(integration.id)) return { integration, status: "new" };
        const stateHash = state.entities[`integration:${integration.id}`]?.hash;
        const unchanged = !force && stateHash === integration.hash;
        return { integration, status: unchanged ? "unchanged" : "update" };
    });
}
