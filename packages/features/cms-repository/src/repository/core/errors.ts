import type {
    CollectionPublicationCode,
    CollectionPublicationResource,
} from "cms-repository/exports/collections/index";
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
