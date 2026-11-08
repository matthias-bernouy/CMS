import { CollectionPublicationError } from "@bernouy/repository/collections";
import { CollectionPublicationRecoveryError } from "@bernouy/repository/repository/authoring";
import { RepositoryRequestError } from "@bernouy/repository/repository/publication";
import { CmsFilesError } from "@bernouy/files";
import type { CapabilityFailure } from "@bernouy/ulvia-sdk";
import type { CapabilityFailurePresentation, CapabilityFailurePresentationContext } from "@bernouy/ulvia-sdk/provider";
import { officialFailure } from "../../dispatch/errors/failure";
import { localizeOfficialError } from "../../dispatch/errors/localize";

/** Feature handlers own domain classification; this surface owns official language and diagnostic copy. */
export function formatOfficialCapabilityFailure(
    failure: CapabilityFailure,
    { contractId, status, invocation }: CapabilityFailurePresentationContext,
): CapabilityFailurePresentation {
    if (
        contractId === "ulvia/repository" &&
        (failure.cause instanceof CollectionPublicationError ||
            (failure.cause instanceof RepositoryRequestError && failure.cause.publicationCode))
    ) {
        return { output: failure.output };
    }
    if (
        contractId === "ulvia/cms.authoring" &&
        (failure.cause instanceof CollectionPublicationRecoveryError ||
            (failure.cause instanceof RepositoryRequestError && failure.cause.publicationCode))
    ) {
        // These typed publication outcomes carry deliberately public recovery/evolution instructions.
        return { output: failure.output };
    }
    const localized = localizeOfficialError(
        officialFailure(
            failure.code,
            status,
            failure.cause,
            undefined,
            failure.cause instanceof CmsFilesError ? failure.cause.responseHeaders : {},
        ),
        contractId,
        failure.capability.id,
        invocation,
    );
    const details = failure.output;
    const presentation = localized.output;
    const output =
        details &&
        typeof details === "object" &&
        !Array.isArray(details) &&
        presentation &&
        typeof presentation === "object" &&
        !Array.isArray(presentation)
            ? { ...details, ...presentation }
            : presentation;
    return { output, responseHeaders: localized.responseHeaders, reason: localized.reason };
}
