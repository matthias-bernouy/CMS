export type IntegrationCandidateBuildErrorCode =
    | "candidate_invalid"
    | "package_invalid"
    | "release_notes_missing"
    | "source_invalid"
    | "source_shape_invalid"
    | "version_missing"
    | "verification_invalid"
    | "verification_missing";

export class IntegrationCandidateBuildError extends Error {
    override readonly name = "IntegrationCandidateBuildError";

    constructor(
        readonly code: IntegrationCandidateBuildErrorCode,
        message: string,
    ) {
        super(message);
    }
}
