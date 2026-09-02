import { changedIntegrationPackagePaths, IntegrationCompatibilityEvaluator } from "@bernouy/cms-integration-registry";
import { inc, major, rcompare } from "semver";
import type { LocalReleasePackage } from "./types";

export type LocalCompatibilityResult = ReturnType<IntegrationCompatibilityEvaluator["evaluate"]>;

const evaluator = new IntegrationCompatibilityEvaluator({
    identity: { name: "ulvia-local-release", version: "1.0.0" },
    now: () => new Date().toISOString(),
    createReportId: () => "ulvia-local-release",
});

export function evaluateLocalCompatibility(
    candidate: LocalReleasePackage,
    baselines: readonly LocalReleasePackage[],
): LocalCompatibilityResult {
    const candidateVersion = candidate.package.envelope.version;
    const ordered = [...baselines].sort((left, right) =>
        rcompare(left.package.envelope.version, right.package.envelope.version),
    );
    const sameMajor = ordered.find((entry) => major(entry.package.envelope.version) === major(candidateVersion));
    const previous = ordered[0];
    const candidateInput = compatibilityPackage(candidate);
    const selected = sameMajor ?? previous;
    const changedPaths = selected
        ? changedIntegrationPackagePaths(selected.package.envelope, candidate.package.envelope)
        : undefined;
    if (sameMajor) {
        return evaluator.evaluate({
            baseline: compatibilityPackage(sameMajor),
            candidate: candidateInput,
            changedPaths,
        });
    }
    if (previous) {
        return evaluator.evaluate({
            noBaselineReason: "new-major",
            informationalBaseline: compatibilityPackage(previous),
            candidate: candidateInput,
            changedPaths,
        });
    }
    return evaluator.evaluate({ noBaselineReason: "new-kind", candidate: candidateInput });
}

function compatibilityPackage(input: LocalReleasePackage) {
    return {
        definition: input.definition,
        packageDigest: input.package.digest,
        ...(input.reviewedSchemaBaselines?.length ? { reviewedSchemaBaselines: input.reviewedSchemaBaselines } : {}),
    };
}

export function assertLocalCompatibility(result: LocalCompatibilityResult): void {
    if (result.contractAdmissible) {
        return;
    }
    const findings = result.evidence
        .filter((entry) => entry.classification !== "compatible" && entry.classification !== "additive")
        .slice(0, 4)
        .map((entry) => `${entry.path}: ${entry.message}`);
    const detail = findings.length ? ` ${findings.join("; ")}` : "";
    throw new Error(
        `Release ${result.kind}@${result.version} requires a ${result.requiredReleaseLevel} version, not ${result.releaseLevel}.${detail}`,
    );
}

export function describeImmutableCoordinateChange(
    candidate: LocalReleasePackage,
    baseline: LocalReleasePackage,
): Readonly<{ requiredReleaseLevel: string; suggestedVersion: string }> {
    const version = candidate.package.envelope.version;
    const hypotheticalVersion = inc(version, "patch");
    if (!hypotheticalVersion) {
        throw new Error(`Cannot calculate a release after ${version}`);
    }
    const hypothetical: LocalReleasePackage = {
        package: {
            ...candidate.package,
            envelope: { ...candidate.package.envelope, version: hypotheticalVersion },
        },
        definition: { ...candidate.definition, version: hypotheticalVersion },
    };
    const result = evaluateLocalCompatibility(hypothetical, [baseline]);
    const requiredReleaseLevel = result.requiredReleaseLevel;
    if (requiredReleaseLevel !== "patch" && requiredReleaseLevel !== "minor" && requiredReleaseLevel !== "major") {
        throw new Error(`Changed package ${candidate.definition.kind}@${version} has no valid release level`);
    }
    const suggestedVersion = inc(version, requiredReleaseLevel);
    if (!suggestedVersion) {
        throw new Error(`Cannot calculate the required ${requiredReleaseLevel} release after ${version}`);
    }
    return { requiredReleaseLevel, suggestedVersion };
}
