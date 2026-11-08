import type { FeatureErrorMapper } from "@bernouy/ulvia-sdk";
import { ObservabilityError } from "observability/core/validation";
export const mapObservabilityError: FeatureErrorMapper = (cause, capability) => {
    const candidate = cause instanceof ObservabilityError ? cause.code : "CORE_UNAVAILABLE";
    const code = Object.hasOwn(capability.errors, candidate) ? candidate : "CORE_UNAVAILABLE";
    return { code, output: { message: "The observability service could not complete the request." } };
};
