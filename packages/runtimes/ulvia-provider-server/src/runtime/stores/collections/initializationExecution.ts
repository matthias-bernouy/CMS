import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import { resolveContract } from "@bernouy/cms-repository/contracts/catalogue";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import type {
    ContractSelectionStore,
    ProviderExecutionStateReader,
    ProviderExecutionState,
} from "@bernouy/cms-repository/providers/selections";
import type { InitializationExecution } from "@bernouy/cms-repository/collections/installations";

/** Refresh authorization evidence without treating an observation timestamp as a new approval. */
export function initializationExecution(
    siteId: string,
    selections: ContractSelectionStore,
    states: ProviderExecutionStateReader,
    releases: ReleaseCatalogue,
) {
    return async (): Promise<InitializationExecution> => {
        const current = await selections.get(siteId);
        if (!current || current.plan.selections.length > 64) {
            throw new Error("Initialization execution is unavailable");
        }
        const ids = [...new Set(current.plan.selections.map(({ installationId }) => installationId))];
        const state = await states.read(siteId, ids);
        if (!state.selections || state.selections.revision !== current.revision) {
            throw conflict();
        }
        const selected = [];
        for (const pin of state.selections.plan.selections) {
            const installation = state.installations.find(({ installation }) => installation.id === pin.installationId);
            if (
                !installation ||
                installation.installation.status !== "enabled" ||
                !installation.observation?.report.implementations.some(
                    (item) =>
                        item.contractId === pin.contractId &&
                        item.version === pin.version &&
                        item.digest === pin.digest &&
                        item.status === "ready",
                )
            ) {
                throw conflict();
            }
            const record = await releases.get(pin.contractId, pin.version);
            if (!record || record.admission.digest !== pin.digest) {
                throw conflict();
            }
            selected.push(await resolveContract(releases, record.admission));
        }
        const fingerprint = executionFingerprint(state);
        if (fingerprint !== executionFingerprint(await states.read(siteId, ids))) {
            throw conflict();
        }
        return { selected, denied: state.selections.grants.denied, fingerprint };
    };
}

function executionFingerprint(state: ProviderExecutionState) {
    return canonicalizeIJson({
        selections: state.selections,
        installations: state.installations
            .map(({ installation, observation }) => ({
                id: installation.id,
                providerId: installation.providerId,
                accountId: installation.accountId,
                siteId: installation.siteId,
                endpoint: installation.endpoint,
                status: installation.status,
                approval: installation.approval,
                configuration: installation.configuration,
                providerTokenRef: installation.providerTokenRef,
                gatewayTokenRef: installation.gatewayTokenRef ?? null,
                report: observation?.report ?? null,
            }))
            .sort((a, b) => (a.id < b.id ? -1 : 1)),
    });
}
function conflict() {
    return Object.assign(new Error("Initialization execution changed or is unavailable"), { status: 409 });
}
