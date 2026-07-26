import type { MigrationCutoverObservationV1 } from "../../../../interfaces/verification/migration";
import { strictRecord } from "../../../validation/structure";
import { oneOf, requiredBoolean } from "../../../validation/values";
import {
    assertObservationPayload,
    canonicalIdentifiers,
    invalid,
    MAX_MIGRATION_OBSERVATIONS,
    optionalDigest,
    parseObservationEvidence,
} from "../shared";

export function parseCutoverObservation(value: unknown, field: string): MigrationCutoverObservationV1 {
    const input = strictRecord(value, field, ["cmsMediated", "providerDirect", "activation"]);
    return {
        cmsMediated: parseCmsCutover(input.cmsMediated, `${field}.cmsMediated`),
        providerDirect: parseProviderCutover(input.providerDirect, `${field}.providerDirect`),
        activation: parseActivation(input.activation, `${field}.activation`),
    };
}

function parseCmsCutover(value: unknown, field: string): MigrationCutoverObservationV1["cmsMediated"] {
    const { input, evidence } = parseObservationEvidence(value, field, [
        "strategy",
        "bindingRevisionBefore",
        "bindingRevisionAfter",
    ]);
    const strategy = oneOf(input.strategy, `${field}.strategy`, ["binding-switch", "not-applicable"] as const);
    const bindingRevisionBefore = optionalDigest(input.bindingRevisionBefore, `${field}.bindingRevisionBefore`);
    const bindingRevisionAfter = optionalDigest(input.bindingRevisionAfter, `${field}.bindingRevisionAfter`);
    if (strategy === "not-applicable") {
        if (evidence.status !== "not-applicable" || bindingRevisionBefore || bindingRevisionAfter) {
            invalid(field, "not-applicable strategy must contain no binding observation");
        }
    } else if (evidence.status === "passed" || evidence.status === "failed") {
        if (!bindingRevisionBefore || !bindingRevisionAfter) {
            invalid(field, `must contain both binding revisions when ${evidence.status}`);
        }
        if ((evidence.status === "passed") !== (bindingRevisionBefore !== bindingRevisionAfter)) {
            invalid(field, "status contradicts the observed binding revision change");
        }
    }
    return {
        ...evidence,
        strategy,
        ...(bindingRevisionBefore ? { bindingRevisionBefore } : {}),
        ...(bindingRevisionAfter ? { bindingRevisionAfter } : {}),
    };
}

function parseProviderCutover(value: unknown, field: string): MigrationCutoverObservationV1["providerDirect"] {
    const { input, evidence } = parseObservationEvidence(value, field, [
        "strategy",
        "callbackIds",
        "signingSecretContinuityObserved",
        "providerStateDigest",
    ]);
    const strategy = oneOf(input.strategy, `${field}.strategy`, [
        "expand-in-code",
        "journalled-provider-switch",
        "not-applicable",
    ] as const);
    const callbackIds = canonicalIdentifiers(input.callbackIds, `${field}.callbackIds`, MAX_MIGRATION_OBSERVATIONS);
    const signingSecretContinuityObserved = optionalBoolean(
        input.signingSecretContinuityObserved,
        `${field}.signingSecretContinuityObserved`,
    );
    const providerStateDigest = optionalDigest(input.providerStateDigest, `${field}.providerStateDigest`);
    if (strategy === "not-applicable") {
        if (
            evidence.status !== "not-applicable" ||
            callbackIds.length ||
            signingSecretContinuityObserved !== undefined ||
            providerStateDigest
        ) {
            invalid(field, "not-applicable strategy must contain no provider observation");
        }
    } else if (evidence.status === "passed" || evidence.status === "failed") {
        if (!callbackIds.length || signingSecretContinuityObserved === undefined) {
            invalid(field, `must contain callback and secret-continuity facts when ${evidence.status}`);
        }
        if (evidence.status === "passed" && !signingSecretContinuityObserved) {
            invalid(field, "cannot pass without signing-secret continuity");
        }
    }
    return {
        ...evidence,
        strategy,
        callbackIds,
        ...(signingSecretContinuityObserved === undefined ? {} : { signingSecretContinuityObserved }),
        ...(providerStateDigest ? { providerStateDigest } : {}),
    };
}

function parseActivation(value: unknown, field: string): MigrationCutoverObservationV1["activation"] {
    const { input, evidence } = parseObservationEvidence(value, field, [
        "activePackageDigest",
        "activeBindingDigest",
        "pointOfNoReturnCrossed",
        "cleanupObserved",
    ]);
    const activePackageDigest = optionalDigest(input.activePackageDigest, `${field}.activePackageDigest`);
    const activeBindingDigest = optionalDigest(input.activeBindingDigest, `${field}.activeBindingDigest`);
    const pointOfNoReturnCrossed = optionalBoolean(input.pointOfNoReturnCrossed, `${field}.pointOfNoReturnCrossed`);
    const cleanupObserved = optionalBoolean(input.cleanupObserved, `${field}.cleanupObserved`);
    const hasPayload = Boolean(
        activePackageDigest ||
            activeBindingDigest ||
            pointOfNoReturnCrossed !== undefined ||
            cleanupObserved !== undefined,
    );
    assertObservationPayload(evidence.status, field, hasPayload);
    if ((evidence.status === "passed" || evidence.status === "failed") && !activePackageDigest) {
        invalid(field, `must contain the observed active package when ${evidence.status}`);
    }
    return {
        ...evidence,
        ...(activePackageDigest ? { activePackageDigest } : {}),
        ...(activeBindingDigest ? { activeBindingDigest } : {}),
        ...(pointOfNoReturnCrossed === undefined ? {} : { pointOfNoReturnCrossed }),
        ...(cleanupObserved === undefined ? {} : { cleanupObserved }),
    };
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
    return value === undefined ? undefined : requiredBoolean(value, field);
}
