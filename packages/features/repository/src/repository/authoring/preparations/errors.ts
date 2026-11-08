import { RepositoryRequestError } from "../../core/errors";
import type { ContentDiagnostic } from "@bernouy/content/page-document";

export class CollectionPreparationError extends Error {
    constructor(
        message: string,
        readonly diagnostics?: readonly ContentDiagnostic[],
    ) {
        super(message);
        this.name = "CollectionPreparationError";
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
        kind: "collection" | "contract" | "provider-manifest" = "collection",
    ) {
        super(
            `${publicationState === "sources-pending" ? "The immutable release is published; private sources are pending." : "The publication outcome is unknown."} Retry publish-${kind} with the same preparationId ${preparationId} and expectedDigest ${digest} after restoring Repository access. Do not change the version or source.`,
            options,
        );
        this.retryable = !(options?.cause instanceof RepositoryRequestError);
        this.name = "CollectionPublicationRecoveryError";
    }
}
