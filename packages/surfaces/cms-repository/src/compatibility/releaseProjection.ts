import type { IntegrationRegistryReleaseEvidence } from "@bernouy/cms-integration-registry";
import type { PublicRepositoryMigrationEvidence, PublicRepositoryRelease } from "./releaseContracts";

export function projectPublicRepositoryRelease(source: IntegrationRegistryReleaseEvidence): PublicRepositoryRelease {
    const compatibility = source.compatibility;
    const verification = source.verification;
    const decision = source.decision;
    const migrations = source.migrations.map(projectMigration);
    const status = releaseStatus(source);
    return {
        kind: source.kind,
        version: source.version,
        packageDigest: source.packageDigest,
        status,
        installable: status === "installable",
        freshInstallOnly: freshInstallOnly(source, migrations),
        ...(source.verificationDigest ? { verificationDigest: source.verificationDigest } : {}),
        ...(compatibility
            ? {
                  compatibility: {
                      reportId: compatibility.current.reportId,
                      reportDigest: compatibility.currentReportDigest,
                      origin: compatibility.current.origin,
                      outcome: compatibility.current.outcome,
                      contractAdmissible: compatibility.current.contractAdmissible,
                      releaseLevel: compatibility.current.releaseLevel,
                      requiredReleaseLevel: compatibility.current.requiredReleaseLevel,
                      evaluator: compatibility.current.evaluator,
                      baselines: compatibility.current.baselines.map(({ kind, version, packageDigest }) => ({
                          kind,
                          version,
                          packageDigest,
                      })),
                      findings: compatibility.current.findings.map(
                          ({ findingId, classification, surface, path, code, message }) => ({
                              findingId,
                              classification,
                              surface,
                              path,
                              code,
                              message,
                          }),
                      ),
                  },
              }
            : {}),
        ...(verification
            ? {
                  verification: {
                      reportId: verification.current.reportId,
                      reportDigest: verification.currentReportDigest,
                      origin: verification.current.origin,
                      outcome: verification.current.outcome,
                      runner: verification.current.runner,
                      environment: verification.current.environment,
                      policy: {
                          ...verification.current.policy,
                          snapshotDigest: verification.current.policySnapshotDigest,
                      },
                      results: verification.current.results.map((result) => ({
                          suiteId: result.suiteId,
                          source: result.source,
                          required: result.required,
                          outcome: result.outcome,
                          attempts: result.attempts,
                          cacheHit: result.cacheHit,
                          diagnostics: result.diagnostics.map(({ code, message }) => ({ code, message })),
                      })),
                  },
              }
            : {}),
        migrations,
        ...(decision
            ? {
                  decision: {
                      decisionId: decision.current.decisionId,
                      decisionDigest: decision.currentReportDigest,
                      admissible: decision.current.admissible,
                      reasons: decision.current.reasons,
                      createdAt: decision.current.createdAt,
                      policy: {
                          ...decision.current.policy,
                          snapshotDigest: decision.current.policySnapshotDigest,
                      },
                  },
              }
            : {}),
    };
}

function projectMigration(
    history: IntegrationRegistryReleaseEvidence["migrations"][number],
): PublicRepositoryMigrationEvidence {
    const report = history.current;
    return {
        reportId: report.reportId,
        reportDigest: history.currentReportDigest,
        origin: report.origin,
        source: report.source,
        supportedSourceRange: report.supportedSourceRange,
        connectorKey: report.connectorKey,
        lineageId: report.lineageId,
        migrationRevision: report.migrationRevision,
        outcome: report.outcome,
        runner: report.runner,
        environmentDigest: report.environmentDigest,
        checks: report.checks,
        cutover: report.cutover,
        rollback: report.rollback,
        pointOfNoReturn: report.pointOfNoReturn,
        delayedCleanupVerified: report.delayedCleanupVerified,
        ...(report.schema === "cms.integration.migration-report.v3"
            ? { operationalEvidence: report.operationalEvidence }
            : {}),
    };
}

function releaseStatus(source: IntegrationRegistryReleaseEvidence): PublicRepositoryRelease["status"] {
    if (source.status) {
        return source.status;
    }
    return source.decision?.current.admissible ? "installable" : "unverified";
}

function freshInstallOnly(
    source: IntegrationRegistryReleaseEvidence,
    migrations: readonly PublicRepositoryMigrationEvidence[],
): boolean {
    const required = source.decision?.current.statefulChanges.requiredMigrations ?? [];
    if (required.length === 0) {
        return (
            source.compatibility?.current.releaseLevel === "major" &&
            !migrations.some(({ outcome }) => outcome === "passed")
        );
    }
    return !required.every((requirement) =>
        migrations.some(
            (migration) =>
                migration.outcome === "passed" &&
                migration.source.kind === requirement.source.kind &&
                migration.source.version === requirement.source.version &&
                migration.source.packageDigest === requirement.source.packageDigest &&
                migration.connectorKey === requirement.connectorKey &&
                migration.lineageId === requirement.lineageId,
        ),
    );
}
