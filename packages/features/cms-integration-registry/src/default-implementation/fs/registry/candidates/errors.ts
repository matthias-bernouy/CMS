export class FsIntegrationRegistryCandidateStoreError extends Error {
    override readonly name = "FsIntegrationRegistryCandidateStoreError";

    constructor(
        readonly code: "candidate_exists" | "candidate_not_found" | "corrupt_candidate" | "inventory_limit",
        message: string,
    ) {
        super(message);
    }
}
