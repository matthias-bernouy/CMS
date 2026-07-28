import { array, boolean, digest, enumValue } from "../../helpers";
import type { CandidateReportIdentity } from "./shared";
import { baseObservation, identifier } from "./shared";

export function validateMigrationCutover(value: unknown, identity: CandidateReportIdentity): void {
    const cutover = object(value);
    validateCmsCutover(cutover.cmsMediated);
    validateProviderCutover(cutover.providerDirect);
    validateActivation(cutover.activation, identity);
}

function validateCmsCutover(value: unknown): void {
    const observation = baseObservation(value, ["strategy", "bindingRevisionBefore", "bindingRevisionAfter"]);
    enumValue(observation.strategy, ["binding-switch", "not-applicable"] as const);
    optionalIdentifier(observation.bindingRevisionBefore);
    optionalIdentifier(observation.bindingRevisionAfter);
}

function validateProviderCutover(value: unknown): void {
    const observation = baseObservation(value, [
        "strategy",
        "callbackIds",
        "signingSecretContinuityObserved",
        "providerStateDigest",
    ]);
    enumValue(observation.strategy, ["expand-in-code", "journalled-provider-switch", "not-applicable"] as const);
    const callbackIds = array(observation.callbackIds, 256).map(identifier);
    if (new Set(callbackIds).size !== callbackIds.length) {
        throw new TypeError("Repository candidate callback observations are duplicated");
    }
    if (observation.signingSecretContinuityObserved !== undefined) {
        boolean(observation.signingSecretContinuityObserved);
    }
    if (observation.providerStateDigest !== undefined) {
        digest(observation.providerStateDigest);
    }
}

function validateActivation(value: unknown, identity: CandidateReportIdentity): void {
    const observation = baseObservation(value, [
        "activePackageDigest",
        "activeBindingDigest",
        "pointOfNoReturnCrossed",
        "cleanupObserved",
    ]);
    if (
        observation.activePackageDigest !== undefined &&
        digest(observation.activePackageDigest) !== identity.packageDigest
    ) {
        throw new TypeError("Repository candidate activation substituted the target package");
    }
    if (observation.activeBindingDigest !== undefined) {
        digest(observation.activeBindingDigest);
    }
    if (observation.pointOfNoReturnCrossed !== undefined) {
        boolean(observation.pointOfNoReturnCrossed);
    }
    if (observation.cleanupObserved !== undefined) {
        boolean(observation.cleanupObserved);
    }
}

function object(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Repository candidate cutover is invalid");
    }
    const input = value as Record<string, unknown>;
    if (
        Object.keys(input).length !== 3 ||
        !("cmsMediated" in input) ||
        !("providerDirect" in input) ||
        !("activation" in input)
    ) {
        throw new TypeError("Repository candidate cutover fields are invalid");
    }
    return input;
}

function optionalIdentifier(value: unknown): void {
    if (value !== undefined) {
        identifier(value);
    }
}
