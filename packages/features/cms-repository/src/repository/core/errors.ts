import type { CollectionPublicationCode, CollectionPublicationResource } from "cms-repository/collections/core/errors";
/** An expected, safely reportable refusal; storage and other technical failures must propagate. */
export class RepositoryRequestError extends Error {
    constructor(
        readonly code: "REJECTED" | "NOT_FOUND",
        message: string = code,
        readonly publicationCode?: CollectionPublicationCode,
        readonly publicationResource?: CollectionPublicationResource,
    ) {
        super(message);
    }
}
