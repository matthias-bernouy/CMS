import type { CollectionPublicationCode, CollectionPublicationResource } from "repository/collections/core/errors";
export type RepositoryRefusalResponse = Readonly<{
    status: number;
    remoteCode?: string;
    requestId?: string;
    phase?: string;
}>;

/** An expected, safely reportable refusal; storage and other technical failures must propagate. */
export class RepositoryRequestError extends Error {
    constructor(
        readonly code: "REJECTED" | "NOT_FOUND" | "CORE_UNAVAILABLE",
        message: string = code,
        readonly publicationCode?: CollectionPublicationCode,
        readonly publicationResource?: CollectionPublicationResource,
        readonly response?: RepositoryRefusalResponse,
    ) {
        super(message);
    }
}
