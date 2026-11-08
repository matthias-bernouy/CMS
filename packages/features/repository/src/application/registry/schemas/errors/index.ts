import {
    namespaceClaimRejectedErrorSchema,
    publicationCommitRejectedErrorSchema,
} from "repository/application/registry/schemas/errors/models";
export const namespaceClaimErrors = {
    REJECTED: { retryable: false, output: namespaceClaimRejectedErrorSchema },
    NOT_FOUND: { retryable: false, output: namespaceClaimRejectedErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: namespaceClaimRejectedErrorSchema },
    ACTOR_UNAVAILABLE: { retryable: false, output: namespaceClaimRejectedErrorSchema },
};
export const publicationCommitErrors = {
    REJECTED: { retryable: false, output: publicationCommitRejectedErrorSchema },
    NOT_FOUND: { retryable: false, output: namespaceClaimRejectedErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: namespaceClaimRejectedErrorSchema },
    ACTOR_UNAVAILABLE: { retryable: false, output: namespaceClaimRejectedErrorSchema },
};
export const assetDownloadErrors = {
    REJECTED: { retryable: false, output: namespaceClaimRejectedErrorSchema },
    NOT_FOUND: { retryable: false, output: namespaceClaimRejectedErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: namespaceClaimRejectedErrorSchema },
};
export const catalogueSearchErrors = {
    REJECTED: { retryable: false, output: namespaceClaimRejectedErrorSchema },
    INVALID_INPUT: { retryable: false, output: namespaceClaimRejectedErrorSchema },
    NOT_FOUND: { retryable: false, output: namespaceClaimRejectedErrorSchema },
    RELEASE_MISMATCH: { retryable: false, output: namespaceClaimRejectedErrorSchema },
    REVISION_CONFLICT: { retryable: false, output: namespaceClaimRejectedErrorSchema },
    CATALOGUE_TOO_LARGE: { retryable: false, output: namespaceClaimRejectedErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: namespaceClaimRejectedErrorSchema },
};
export const publicationCheckCollectionErrors = {
    REJECTED: { retryable: false, output: publicationCommitRejectedErrorSchema },
    NOT_FOUND: { retryable: false, output: namespaceClaimRejectedErrorSchema },
    CORE_UNAVAILABLE: { retryable: true, output: namespaceClaimRejectedErrorSchema },
};
