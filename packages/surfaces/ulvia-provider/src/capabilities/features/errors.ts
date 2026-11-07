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
        officialFailure(failure.code, status, failure.cause),
        contractId,
        failure.capability.id,
        invocation,
    );
    return { output: localized.output, responseHeaders: localized.responseHeaders, reason: localized.reason };
}
