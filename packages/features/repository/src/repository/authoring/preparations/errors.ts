import { RepositoryRequestError } from "../../core/errors";
import type { ContentDiagnostic } from "@bernouy/content/page-document";
import { PREPARATION_LIMIT } from "./limits";

export class CollectionPreparationError extends Error {
    constructor(
        message: string,
        readonly diagnostics?: readonly ContentDiagnostic[],
    ) {
        super(message);
        this.name = "CollectionPreparationError";
    }
}

export class PreparationQuotaError extends CollectionPreparationError {
    readonly limit = PREPARATION_LIMIT;
    constructor(readonly count: number) {
        const message = `Prepared resource limit reached (${count}/${PREPARATION_LIMIT}). Call list-preparations, then discard-preparation with an explicitly selected preparationId; retry after in-progress preparations finish if no completed preparation is listed.`;
        super(message, [{ code: "preparation.quota_exceeded", severity: "error", message }]);
        this.name = "PreparationQuotaError";
    }
}

/** The immutable release is known to exist; only its private sources need completion. */
export class CollectionPublicationRecoveryError extends Error {
    readonly retryable: boolean;
    constructor(
        readonly preparationId: string,
        readonly digest: string,
        readonly publicationState: "sources-pending" | "unknown",
        options?: ErrorOptions,
        kind: "collection" | "contract" | "provider-manifest" | "workflow" = "collection",
    ) {
        super(
            `${publicationState === "sources-pending" ? "The immutable release is published; private sources are pending." : "The publication outcome is unknown."} Retry publish-${kind} with the same preparationId ${preparationId} and expectedDigest ${digest} after restoring Repository access. Do not change the version or source.`,
            options,
        );
        this.retryable = !(options?.cause instanceof RepositoryRequestError);
        this.name = "CollectionPublicationRecoveryError";
    }
}
