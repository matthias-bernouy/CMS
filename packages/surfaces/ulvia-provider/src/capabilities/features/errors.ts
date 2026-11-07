import { CmsFilesError } from "@bernouy/cms-files";
import type { CapabilityFailure } from "@bernouy/ulvia-sdk";
import type { CapabilityFailurePresentation, CapabilityFailurePresentationContext } from "@bernouy/ulvia-sdk/provider";
import { officialFailure } from "../../dispatch/errors/failure";
import { localizeOfficialError } from "../../dispatch/errors/localize";

/** Feature handlers own domain classification; this surface owns official language and diagnostic copy. */
export function formatOfficialCapabilityFailure(
    failure: CapabilityFailure,
    { contractId, status, invocation }: CapabilityFailurePresentationContext,
): CapabilityFailurePresentation {
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
