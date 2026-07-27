import type { IntegrationRegistryReleaseEvidence } from "@bernouy/cms-integration-registry";
import { isIntegrationReleaseFreshInstallOnly } from "@bernouy/cms-integration-verification";

export function projectRepositoryManagementRelease(source: IntegrationRegistryReleaseEvidence) {
    const status = source.status ?? (source.decision?.current.admissible ? "installable" : "unverified");
    const migrations = source.migrations.map(({ current, currentReportDigest }) => ({
        reportId: current.reportId,
        reportDigest: currentReportDigest,
        origin: current.origin,
        source: current.source,
        supportedSourceRange: current.supportedSourceRange,
        connectorKey: current.connectorKey,
        lineageId: current.lineageId,
        migrationRevision: current.migrationRevision,
        outcome: current.outcome,
        runner: current.runner,
        environmentDigest: current.environmentDigest,
        checks: current.checks,
        cutover: current.cutover,
        ...(current.schema === "cms.integration.migration-report.v4"
            ? { cutoverEvidence: current.cutoverEvidence }
            : {}),
        rollback: current.rollback,
        pointOfNoReturn: current.pointOfNoReturn,
        delayedCleanupVerified: current.delayedCleanupVerified,
        ...(current.schema === "cms.integration.migration-report.v3" ||
        current.schema === "cms.integration.migration-report.v4"
            ? { operationalEvidence: current.operationalEvidence }
            : {}),
    }));
    return {
        kind: source.kind,
        version: source.version,
        packageDigest: source.packageDigest,
        status,
        installable: status === "installable",
        freshInstallOnly: isIntegrationReleaseFreshInstallOnly({
            releaseLevel: source.compatibility?.current.releaseLevel,
            requiredMigrations: source.decision?.current.statefulChanges.requiredMigrations ?? [],
            migrations: source.migrations.map(({ current }) => current),
        }),
        ...(source.verificationDigest ? { verificationDigest: source.verificationDigest } : {}),
        ...(source.compatibility ? { compatibility: compatibility(source.compatibility) } : {}),
        ...(source.verification ? { verification: verification(source.verification) } : {}),
        migrations,
        ...(source.decision ? { decision: decision(source.decision) } : {}),
    };
}

function compatibility(history: NonNullable<IntegrationRegistryReleaseEvidence["compatibility"]>) {
    const report = history.current;
    return {
        reportId: report.reportId,
        reportDigest: history.currentReportDigest,
        origin: report.origin,
        outcome: report.outcome,
        contractAdmissible: report.contractAdmissible,
        releaseLevel: report.releaseLevel,
        requiredReleaseLevel: report.requiredReleaseLevel,
        evaluator: report.evaluator,
        baselines: report.baselines.map(({ kind, version, packageDigest }) => ({ kind, version, packageDigest })),
        findings: report.findings.map(({ findingId, classification, surface, path, code, message }) => ({
            findingId,
            classification,
            surface,
            path,
            code,
            message,
        })),
    };
}

function verification(history: NonNullable<IntegrationRegistryReleaseEvidence["verification"]>) {
    const report = history.current;
    return {
        reportId: report.reportId,
        reportDigest: history.currentReportDigest,
        origin: report.origin,
        createdAt: report.createdAt,
        outcome: report.outcome,
        runner: report.runner,
        environment: report.environment,
        policy: { ...report.policy, snapshotDigest: report.policySnapshotDigest },
        activeContracts: report.activeContracts.map(({ contractId, ownerVersion, digest }) => ({
            contractId,
            ownerVersion,
            digest,
        })),
        results: report.results.map((result) => ({
            suiteId: result.suiteId,
            source: result.source,
            required: result.required,
            outcome: result.outcome,
            durationMs: result.durationMs,
            attempts: result.attempts,
            cacheHit: result.cacheHit,
            diagnostics: result.diagnostics.map(({ code, message }) => ({ code, message })),
        })),
    };
}

function decision(history: NonNullable<IntegrationRegistryReleaseEvidence["decision"]>) {
    const report = history.current;
    return {
        decisionId: report.decisionId,
        decisionDigest: history.currentReportDigest,
        admissible: report.admissible,
        reasons: report.reasons,
        createdAt: report.createdAt,
        policy: { ...report.policy, snapshotDigest: report.policySnapshotDigest },
    };
}
