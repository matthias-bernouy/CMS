import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    composeReleaseAdmissionDecision,
    identifyCompatibilityReportV2,
    identifyReviewedSchemaBaseline,
    identifyStatefulChangeSelection,
    parseCompatibilityReportV2,
    parseVerificationReport,
    type PinnedVerificationRunnerIdentity,
    type ReviewedSchemaBaselineV1,
    type VerificationSuiteResult,
} from "@bernouy/cms-integration-verification";
import { OFFICIAL_INTEGRATIONS_ROOT } from "../../../index";
import type { OfficialRepositoryBootstrapEvidenceV1 } from "../../contracts";
import { resolveOfficialIntegrationDependencies } from "../../dependencies";
import { buildOfficialIntegrationPackages } from "../runtime";
import {
    OFFICIAL_INTEGRATION_VERIFICATION_POLICY,
    OFFICIAL_VERIFICATION_BACKFILL_CREATED_AT,
    type OfficialVerificationBackfillReportSet,
} from "./contracts";
import { loadOfficialIntegrationVerificationBackfill } from "./loader";

const BUN_IMAGE_DIGEST = "sha256:5acc90a93e91ff07bf72aa90a7c9f0fa189765aec90b47bdbf2152d2196383c0";
const POSTGRES_RUNNER: PinnedVerificationRunnerIdentity = Object.freeze({
    name: "cms-schema-generator",
    version: "1.0.0",
    imageDigest: BUN_IMAGE_DIGEST,
});
const PACKAGE_AUDIT_RUNNER: PinnedVerificationRunnerIdentity = Object.freeze({
    name: "cms-official-package-audit",
    version: "1.0.0",
    imageDigest: BUN_IMAGE_DIGEST,
});

export async function buildOfficialVerificationBackfillReports(
    requestedRoot: string = OFFICIAL_INTEGRATIONS_ROOT,
    suppliedEvidence?: OfficialRepositoryBootstrapEvidenceV1,
): Promise<readonly OfficialVerificationBackfillReportSet[]> {
    const packages = await buildOfficialIntegrationPackages(requestedRoot);
    const verificationBackfill = await loadOfficialIntegrationVerificationBackfill(requestedRoot);
    const evidence =
        suppliedEvidence ??
        (await (await import("../../evidence")).loadOfficialRepositoryBootstrapEvidence(requestedRoot));
    const packagesByKind = new Map(packages.map((entry) => [entry.kind, entry]));
    const baselineByKind = new Map(evidence.reviewedSchemaBaselines.map((entry) => [entry.kind, entry]));

    return await Promise.all(
        packages.map(async (integrationPackage, index) => {
            const bundle = verificationBackfill.verifications[index];
            if (
                !bundle ||
                bundle.kind !== integrationPackage.kind ||
                bundle.version !== integrationPackage.version ||
                bundle.packageDigest !== integrationPackage.digest
            ) {
                throw new Error(
                    "Official verification backfill report input is not aligned with the package inventory",
                );
            }
            const baseline = baselineByKind.get(integrationPackage.kind);
            const dependencies = resolveOfficialIntegrationDependencies(integrationPackage.definition, packages)
                .map(({ kind, version, digest }) => ({ kind, version, packageDigest: digest }))
                .sort(compareVersionReferences);
            const compatibility = await compatibilityReport(integrationPackage);
            const compatibilityIdentity = await identifyCompatibilityReportV2(compatibility);
            const statefulChanges = await identifyStatefulChangeSelection({
                schema: "cms.integration.stateful-change-selection.v1",
                selector: OFFICIAL_INTEGRATION_VERIFICATION_POLICY,
                policySnapshotDigest: await policySnapshotDigest(),
                target: {
                    kind: integrationPackage.kind,
                    version: integrationPackage.version,
                    packageDigest: integrationPackage.digest,
                },
                compatibilityReport: {
                    revisionId: compatibility.reportId,
                    reportDigest: compatibilityIdentity.digest,
                },
                requiredMigrations: [],
            });
            const verification = await verificationReport({
                kind: integrationPackage.kind,
                version: integrationPackage.version,
                packageDigest: integrationPackage.digest,
                verificationDigest: bundle.verificationDigest,
                dependencies,
                baseline,
            });
            const decision = await composeReleaseAdmissionDecision({
                decisionId: `official-admission/${integrationPackage.kind}/${integrationPackage.version}/v1`,
                revisionType: "root",
                compatibility,
                verification,
                migrations: [],
                statefulChanges,
                policy: OFFICIAL_INTEGRATION_VERIFICATION_POLICY,
                policySnapshotDigest: await policySnapshotDigest(),
                createdAt: OFFICIAL_VERIFICATION_BACKFILL_CREATED_AT,
                provenance: {
                    actor: "official-integrations-ci",
                    reason: "Composite decision from the exact legacy backfill evidence.",
                    evidenceIds: [integrationPackage.digest, bundle.verificationDigest],
                },
            });
            assertDependencyClosure(dependencies, packagesByKind);
            return { compatibility, verification, statefulChanges: statefulChanges.selection, decision };
        }),
    );
}

async function compatibilityReport(
    integrationPackage: Awaited<ReturnType<typeof buildOfficialIntegrationPackages>>[number],
) {
    return await parseCompatibilityReportV2({
        schema: "cms.integration.compatibility-report.v2",
        reportId: `official-compatibility/${integrationPackage.kind}/${integrationPackage.version}/v1`,
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: OFFICIAL_VERIFICATION_BACKFILL_CREATED_AT,
        kind: integrationPackage.kind,
        version: integrationPackage.version,
        packageDigest: integrationPackage.digest,
        evaluator: { name: "official-bootstrap-compatibility", version: "1.0.0" },
        baselines: [],
        informationalBaselines: [],
        findings: [],
        outcome: "not-applicable",
        requiredReleaseLevel: "none",
        releaseLevel: "initial",
        contractAdmissible: true,
        noBaselineReason: "new-kind",
        provenance: {
            actor: "official-integrations-ci",
            reason: "Initial official version has no prior compatibility baseline.",
            evidenceIds: [integrationPackage.digest],
        },
    });
}

async function verificationReport(
    input: Readonly<{
        kind: string;
        version: string;
        packageDigest: string;
        verificationDigest: string;
        dependencies: readonly Readonly<{ kind: string; version: string; packageDigest: string }>[];
        baseline?: ReviewedSchemaBaselineV1;
    }>,
) {
    const baselineIdentity = input.baseline ? await identifyReviewedSchemaBaseline(input.baseline) : undefined;
    const policyDigest = await policySnapshotDigest();
    const results = await verificationResults(input.packageDigest, baselineIdentity);
    const admissionInputDigest = await sha256Hex(
        canonicalJsonBytes({
            target: { kind: input.kind, version: input.version, packageDigest: input.packageDigest },
            verificationDigest: input.verificationDigest,
            dependencies: input.dependencies,
            baselines: baselineIdentity ? [baselineIdentity.digest] : [],
            policySnapshotDigest: policyDigest,
        }),
    );
    return parseVerificationReport({
        schema: "cms.integration.verification-report.v1",
        reportId: `official-verification/${input.kind}/${input.version}/v1`,
        revisionType: "root",
        origin: "legacy-backfill",
        createdAt: OFFICIAL_VERIFICATION_BACKFILL_CREATED_AT,
        kind: input.kind,
        version: input.version,
        packageDigest: input.packageDigest,
        verificationDigest: input.verificationDigest,
        runner: baselineIdentity ? POSTGRES_RUNNER : PACKAGE_AUDIT_RUNNER,
        policy: OFFICIAL_INTEGRATION_VERIFICATION_POLICY,
        policySnapshotDigest: policyDigest,
        admissionInputDigest,
        verificationJobResultDigest: await sha256Hex(canonicalJsonBytes(results)),
        dependencies: input.dependencies,
        baselines: baselineIdentity
            ? [
                  {
                      kind: input.baseline!.kind,
                      version: input.baseline!.version,
                      packageDigest: input.baseline!.packageDigest,
                      connectorKey: input.baseline!.connectorKey,
                      lineageId: input.baseline!.lineageId,
                      revisionId: input.baseline!.reportId,
                      baselineDigest: baselineIdentity.digest,
                      observedSchemaDigest: input.baseline!.observedSchemaDigest,
                  },
              ]
            : [],
        activeContracts: [],
        environment: baselineIdentity
            ? {
                  digest: input.baseline!.environment.digest,
                  versions: {
                      postgres: input.baseline!.environment.postgresVersion,
                      bun: "1.3.14",
                  },
              }
            : {
                  digest: await packageAuditEnvironmentDigest(),
                  versions: { bun: "1.3.14" },
              },
        results,
        outcome: "passed",
        provenance: {
            actor: "official-integrations-ci",
            reason: baselineIdentity
                ? "Backfilled from pinned fresh/fresh and SQL reapplication calibration evidence."
                : "Backfilled from strict canonical package and definition validation only.",
            evidenceIds: baselineIdentity
                ? [baselineIdentity.digest, input.baseline!.observedSchemaDigest]
                : [input.packageDigest],
        },
    });
}

async function verificationResults(
    packageDigest: string,
    baseline: Awaited<ReturnType<typeof identifyReviewedSchemaBaseline>> | undefined,
): Promise<readonly VerificationSuiteResult[]> {
    const packageResult: VerificationSuiteResult = {
        suiteId: "package-contract-validation",
        source: "platform",
        required: true,
        outcome: "passed",
        durationMs: 0,
        attempts: 1,
        cacheHit: false,
        evidenceDigests: [packageDigest],
        diagnostics: [],
    };
    if (!baseline) {
        return [packageResult];
    }
    return [
        packageResult,
        {
            suiteId: "sql-install-and-reapply",
            source: "platform",
            required: true,
            outcome: "passed",
            durationMs: 0,
            attempts: 1,
            cacheHit: false,
            evidenceDigests: [baseline.digest, baseline.baseline.observedSchemaDigest],
            diagnostics: [],
        },
    ];
}

let cachedPolicySnapshotDigest: Promise<string> | undefined;
function policySnapshotDigest(): Promise<string> {
    cachedPolicySnapshotDigest ??= sha256Hex(
        canonicalJsonBytes({
            policy: OFFICIAL_INTEGRATION_VERIFICATION_POLICY,
            mandatorySuites: ["package-contract-validation", "sql-install-and-reapply-when-applicable"],
            legacyAuthorSuites: "documented-but-not-claimed",
        }),
    );
    return cachedPolicySnapshotDigest;
}

let cachedPackageAuditEnvironmentDigest: Promise<string> | undefined;
function packageAuditEnvironmentDigest(): Promise<string> {
    cachedPackageAuditEnvironmentDigest ??= sha256Hex(
        canonicalJsonBytes({ runner: PACKAGE_AUDIT_RUNNER, bun: "1.3.14", network: "not-required" }),
    );
    return cachedPackageAuditEnvironmentDigest;
}

function assertDependencyClosure(
    dependencies: readonly Readonly<{ kind: string; version: string; packageDigest: string }>[],
    packagesByKind: ReadonlyMap<string, Awaited<ReturnType<typeof buildOfficialIntegrationPackages>>[number]>,
): void {
    for (const dependency of dependencies) {
        const integrationPackage = packagesByKind.get(dependency.kind);
        if (
            !integrationPackage ||
            integrationPackage.version !== dependency.version ||
            integrationPackage.digest !== dependency.packageDigest
        ) {
            throw new Error("Official verification backfill dependency closure changed");
        }
    }
}

function compareVersionReferences(
    left: Readonly<{ kind: string; version: string; packageDigest: string }>,
    right: Readonly<{ kind: string; version: string; packageDigest: string }>,
): number {
    return compareText(left.kind, right.kind) || compareText(left.version, right.version);
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
