import type { IntegrationRegistryReleaseEvidence } from "@bernouy/cms-integration-registry";

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
        rollback: current.rollback,
        pointOfNoReturn: current.pointOfNoReturn,
        delayedCleanupVerified: current.delayedCleanupVerified,
    }));
    return {
        kind: source.kind,
        version: source.version,
        packageDigest: source.packageDigest,
        status,
        installable: status === "installable",
        freshInstallOnly: freshInstallOnly(source),
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
        outcome: report.outcome,
        runner: report.runner,
        environment: report.environment,
        policy: { ...report.policy, snapshotDigest: report.policySnapshotDigest },
        results: report.results.map((result) => ({
            suiteId: result.suiteId,
            source: result.source,
            required: result.required,
            outcome: result.outcome,
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

function freshInstallOnly(source: IntegrationRegistryReleaseEvidence): boolean {
    const required = source.decision?.current.statefulChanges.requiredMigrations ?? [];
    if (required.length === 0) {
        return false;
    }
    return !required.every((requirement) =>
        source.migrations.some(
            ({ current }) =>
                current.outcome === "passed" &&
                current.source.kind === requirement.source.kind &&
                current.source.version === requirement.source.version &&
                current.source.packageDigest === requirement.source.packageDigest &&
                current.connectorKey === requirement.connectorKey &&
                current.lineageId === requirement.lineageId,
        ),
    );
}
