import type { MigrationJobResultV1, MigrationVerificationInputV1 } from "@bernouy/cms-integration-verification";

export function targetObservation(
    stateDigest: string,
    schemaDigest: string,
    dataDigest: string,
    evidenceDigests: readonly string[],
    diagnosticCodes: readonly string[],
): MigrationJobResultV1["observations"]["freshTarget"] {
    return {
        status: "passed",
        evidenceDigests,
        diagnosticCodes,
        stateDigest,
        schemaDigest,
        dataDigest,
        functionDigests: [],
    };
}

export function unsupportedCutover(
    input: MigrationVerificationInputV1,
    unavailableStatus: "not-supported" | "infrastructure-failure",
    infrastructureCode = "",
): MigrationJobResultV1["observations"]["cutover"] {
    const unavailable =
        unavailableStatus === "infrastructure-failure"
            ? infrastructureEvidence(infrastructureCode)
            : unsupportedEvidence("sql-runner-does-not-exercise-cutover");
    return {
        cmsMediated: input.migrationPlan.plan.cmsMediated
            ? { ...unavailable, strategy: "binding-switch" }
            : { ...notApplicableEvidence(), strategy: "not-applicable" },
        providerDirect: input.migrationPlan.plan.providerDirect
            ? {
                  ...unavailable,
                  strategy: input.migrationPlan.plan.providerDirect.strategy,
                  callbackIds: input.migrationPlan.plan.providerDirect.callbackIds,
              }
            : { ...notApplicableEvidence(), strategy: "not-applicable", callbackIds: [] },
        activation: unavailable,
    };
}

export function unsupportedEvidence(code: string) {
    return { status: "not-supported" as const, evidenceDigests: [], diagnosticCodes: [code] };
}

export function infrastructureEvidence(code: string) {
    return { status: "infrastructure-failure" as const, evidenceDigests: [], diagnosticCodes: [code] };
}

function notApplicableEvidence() {
    return { status: "not-applicable" as const, evidenceDigests: [], diagnosticCodes: [] };
}
