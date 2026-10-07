import type { AdmittedContractRelease } from "../../admission/admitContractRelease";
import { ReleaseValidationError } from "../../protocol/errors";
import { deepFreeze } from "../../protocol/values";
import type { ContractConformanceSuite } from "../../../interfaces/Conformance";

export interface CapabilityConformanceCoverage {
    readonly capabilityId: string;
    readonly called: boolean;
    readonly successCalled: boolean;
    readonly successAsserted: boolean;
    readonly successExemptionReason?: string;
    readonly missingSuccessAssertion: boolean;
    readonly coveredErrorCodes: readonly string[];
    readonly exemptedErrors: readonly { readonly code: string; readonly reason: string }[];
    readonly missingErrorCodes: readonly string[];
}

export interface ConformanceCoverageReport {
    readonly scenarioCount: number;
    readonly callCount: number;
    readonly capabilities: readonly CapabilityConformanceCoverage[];
    /** Aggregate coverage must not conceal a gap in an individual selected dependency profile. */
    readonly profiles?: readonly ConformanceProfileCoverage[];
}

export interface ConformanceProfileCoverage {
    readonly profileId: string;
    readonly scenarioCount: number;
    readonly callCount: number;
    readonly capabilities: readonly CapabilityConformanceCoverage[];
}

/** Descriptive coverage only; it never states that a provider passed. */
export function analyzeConformanceCoverage(
    release: AdmittedContractRelease,
    suite?: ContractConformanceSuite,
): ConformanceCoverageReport {
    if (
        suite &&
        (suite.contractDigest !== release.digest ||
            suite.contractId !== release.release.contractId ||
            suite.contractVersion !== release.release.version ||
            suite.publisherId !== release.release.publisherId)
    ) {
        throw new ReleaseValidationError("invalid_contract", "coverage suite does not match release");
    }
    const calls = suite?.scenarios.flatMap((scenario) => scenario.calls) ?? [];
    const capabilities = release.release.capabilities.map((capability) => {
        const relevant = calls.filter(
            (call) => call.dependencyContractId === undefined && call.capabilityId === capability.id,
        );
        const covered = new Set(relevant.flatMap((call) => (call.expect.kind === "error" ? [call.expect.code] : [])));
        const exemptions = suite?.coverageExemptions?.filter((entry) => entry.capabilityId === capability.id) ?? [];
        const successExemptionReason = exemptions.find((entry) => !entry.errorCode)?.reason;
        const successAsserted = relevant.some(
            (call) => call.expect.kind === "success" && (call.expect.checks?.length ?? 0) > 0,
        );
        return {
            capabilityId: capability.id,
            called: relevant.length > 0,
            successCalled: relevant.some((call) => call.expect.kind === "success"),
            successAsserted,
            ...(successExemptionReason ? { successExemptionReason } : {}),
            missingSuccessAssertion: !successAsserted && !successExemptionReason,
            coveredErrorCodes: capability.errors.map((error) => error.code).filter((code) => covered.has(code)),
            exemptedErrors: capability.errors.flatMap((error) => {
                const reason = exemptions.find((entry) => entry.errorCode === error.code)?.reason;
                return reason ? [{ code: error.code, reason }] : [];
            }),
            missingErrorCodes: capability.errors
                .map((error) => error.code)
                .filter((code) => !covered.has(code) && !exemptions.some((entry) => entry.errorCode === code)),
        };
    });
    return deepFreeze({
        scenarioCount: suite?.scenarios.length ?? 0,
        callCount: calls.length,
        capabilities,
        ...(suite?.dependencyProfiles
            ? {
                  profiles: suite.dependencyProfiles.map((profile) => {
                      const { dependencyProfiles: _, ...withoutProfiles } = suite;
                      const report = analyzeConformanceCoverage(release, {
                          ...withoutProfiles,
                          scenarios: suite.scenarios.filter(
                              (scenario) => !scenario.profiles || scenario.profiles.includes(profile.id),
                          ),
                      });
                      return { profileId: profile.id, ...report };
                  }),
              }
            : {}),
    }) as ConformanceCoverageReport;
}
