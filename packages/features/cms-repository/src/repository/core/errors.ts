/** An expected, safely reportable refusal; storage and other technical failures must propagate. */
export class RepositoryRequestError extends Error {
    constructor(
        readonly code: "REJECTED" | "NOT_FOUND",
        message: string = code,
    ) {
        super(message);
    }
}
