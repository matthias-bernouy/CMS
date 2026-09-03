import {
    RELEASE_RUNTIME_PLATFORM_VERIFICATION_SUITE_V1,
    type PlatformVerificationEvidenceV1,
    type ReleaseVerificationPlanScenarioV1,
    type VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import { SUPABASE_CLI_VERSION, type ReleaseRuntimeExecution } from "@bernouy/ulvia-cli/release-runtime";
import { checkEvidence, finding, suiteEvidence } from "../service/postgres/evidence";

type ScenarioResult = ReleaseRuntimeExecution["scenarios"][number];

export async function releaseRuntimeEvidence(
    suiteDigest: string,
    planDigest: string,
    execution: ReleaseRuntimeExecution,
): Promise<PlatformVerificationEvidenceV1> {
    const checks = await Promise.all([
        checkEvidence(
            "exact-release-plan",
            {
                planDigest,
                scenarios: execution.scenarios.map(({ scenario }) => scenarioIdentity(scenario)),
            },
            [],
        ),
        scenarioCheck(
            "fresh-install",
            execution.scenarios.filter(({ scenario }) => scenario.type === "fresh-install"),
        ),
        scenarioCheck(
            "historical-upgrades",
            execution.scenarios.filter(({ scenario }) => scenario.type === "upgrade"),
        ),
        scenarioCheck(
            "business-fixtures",
            execution.scenarios.filter(
                ({ scenario }) => scenario.type !== "fresh-install" && Boolean(scenario.fixtureName),
            ),
        ),
        scenarioCheck(
            "crash-recovery",
            execution.scenarios.filter(({ scenario }) => scenario.type === "crash-recovery"),
        ),
    ]);
    return suiteEvidence(
        RELEASE_RUNTIME_PLATFORM_VERIFICATION_SUITE_V1,
        suiteDigest,
        checks.toSorted((left, right) => left.checkId.localeCompare(right.checkId)),
    );
}

export function releaseRuntimeDiagnostics(
    evidence: PlatformVerificationEvidenceV1,
): VerificationJobResultV1["results"][number]["diagnostics"] {
    return evidence.checks
        .filter((check) => check.findings.length > 0)
        .slice(0, 8)
        .map((check) => ({
            code: `release-runtime-${check.checkId}-failed`,
            message: `${check.checkId} rejected one or more isolated runtime scenarios`,
            redacted: true as const,
        }));
}

async function scenarioCheck(checkId: string, results: readonly ScenarioResult[]) {
    const subjects = results.map(({ scenario, outcome }) => ({ identity: scenarioIdentity(scenario), outcome }));
    const findings = results
        .filter(({ outcome }) => outcome === "failed")
        .map(({ scenario }) => finding("release-runtime-scenario-failed", `release/${scenarioIdentity(scenario)}`));
    return await checkEvidence(checkId, subjects, findings);
}

function scenarioIdentity(scenario: ReleaseVerificationPlanScenarioV1): string {
    if (scenario.type === "fresh-install") {
        return "fresh-install";
    }
    const fixture = scenario.fixtureName ? `/${safeSegment(scenario.fixtureName)}` : "";
    if (scenario.type === "upgrade") {
        return `upgrade/${scenario.baseline.version}/${scenario.baseline.packageDigest}${fixture}`;
    }
    return `crash-recovery/${scenario.baseline.version}/${scenario.baseline.packageDigest}/${scenario.phase}${fixture}`;
}

function safeSegment(value: string): string {
    return Buffer.from(value).toString("base64url");
}

export function releaseRuntimeEnvironmentVersions(): readonly Readonly<{ name: string; version: string }>[] {
    return [
        { name: "bun", version: Bun.version },
        { name: "release-runtime-contract", version: "1.0.0" },
        { name: "supabase-cli", version: SUPABASE_CLI_VERSION },
    ].toSorted((left, right) => left.name.localeCompare(right.name));
}
