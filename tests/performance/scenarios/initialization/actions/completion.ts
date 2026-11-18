import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { ClientFailure } from "../../../harness/clients/failure";
import { requireRecord } from "../../queries/types";
import type { ClientCall } from "../../../harness/clients/types";
import type { FreshTenant } from "../../installations/fresh";
import type { Dataset } from "../datasets";

export function initializationTerminal(value: unknown, operationId: string, digest: string, dataset: Dataset) {
    const row = requireRecord(value);
    if (row.operationId && row.operationId !== operationId) {
        throw new ClientFailure("initialization-operation-mismatch");
    }
    if (row.operationStatus === "failed") {
        throw new ClientFailure("initialization-operation-failed");
    }
    if (row.status !== "completed") {
        return undefined;
    }
    if (
        row.planDigest !== digest ||
        row.rootJson !== canonicalizeIJson(dataset.root) ||
        row.completedPages !== dataset.paths.length ||
        row.totalPages !== dataset.paths.length
    ) {
        throw new ClientFailure("initialization-terminal-result-mismatch");
    }
    const { operationId: _id, operationStatus: _status, errorMessage: _error, ...result } = row;
    return result;
}

export function initializationCompletion(
    state: FreshTenant,
    digest: () => string,
    dataset: Dataset,
): NonNullable<ClientCall["complete"]> {
    return async (operationId, signal, recordPoll) => {
        for (let attempt = 0; attempt < 150; attempt++) {
            signal.throwIfAborted();
            const response = await state.client(
                "ulvia/cms.installations",
                "initialization.status",
                "http",
                {},
                undefined,
                { signal },
            );
            recordPoll(response.observation);
            if (!response.observation.validated) {
                throw new ClientFailure("initialization-status-invalid");
            }
            const terminal = initializationTerminal(response.output, operationId, digest(), dataset);
            if (terminal) {
                return terminal;
            }
            await Bun.sleep(200);
        }
        throw new ClientFailure("initialization-poll-limit-exceeded");
    };
}
