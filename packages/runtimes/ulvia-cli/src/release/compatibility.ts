import { changedIntegrationPackagePaths, IntegrationCompatibilityEvaluator } from "@bernouy/cms-integration-registry";
import { major, rcompare } from "semver";
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
    const candidateInput = { definition: candidate.definition, packageDigest: candidate.package.digest };
    const selected = sameMajor ?? previous;
    const changedPaths = selected
        ? changedIntegrationPackagePaths(selected.package.envelope, candidate.package.envelope)
        : undefined;
    if (sameMajor) {
        return evaluator.evaluate({
            baseline: { definition: sameMajor.definition, packageDigest: sameMajor.package.digest },
            candidate: candidateInput,
            changedPaths,
        });
    }
    if (previous) {
        return evaluator.evaluate({
            noBaselineReason: "new-major",
            informationalBaseline: { definition: previous.definition, packageDigest: previous.package.digest },
            candidate: candidateInput,
            changedPaths,
        });
    }
    return evaluator.evaluate({ noBaselineReason: "new-kind", candidate: candidateInput });
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
