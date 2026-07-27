import type { IntegrationRegistryReleaseEvidence } from "@bernouy/cms-integration-registry";
import { isIntegrationReleaseFreshInstallOnly } from "@bernouy/cms-integration-verification";
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
        freshInstallOnly: isIntegrationReleaseFreshInstallOnly({
            releaseLevel: source.compatibility?.current.releaseLevel,
            requiredMigrations: source.decision?.current.statefulChanges.requiredMigrations ?? [],
            migrations: source.migrations.map(({ current }) => current),
        }),
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
                          ({ findingId, classification, surface, code, message }) => ({
                              findingId,
                              classification,
                              surface,
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
                      createdAt: verification.current.createdAt,
                      outcome: verification.current.outcome,
                      runner: verification.current.runner,
                      environment: verification.current.environment,
                      policy: {
                          ...verification.current.policy,
                          snapshotDigest: verification.current.policySnapshotDigest,
                      },
                      activeContracts: verification.current.activeContracts.map(
                          ({ contractId, ownerVersion, digest }) => ({
                              contractId,
                              ownerVersion,
                              digest,
                          }),
                      ),
                      results: verification.current.results.map((result) => ({
                          suiteId: result.suiteId,
                          source: result.source,
                          required: result.required,
                          outcome: result.outcome,
                          durationMs: result.durationMs,
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
        cutoverEvidence: report.cutoverEvidence,
        rollback: report.operationalEvidence.rollback.capability,
        pointOfNoReturn: report.operationalEvidence.pointOfNoReturn.phase,
        delayedCleanupVerified: report.operationalEvidence.cleanup.observed,
        operationalEvidence: report.operationalEvidence,
    };
}

function releaseStatus(source: IntegrationRegistryReleaseEvidence): PublicRepositoryRelease["status"] {
    if (source.status) {
        return source.status;
    }
    return source.decision?.current.admissible ? "installable" : "unverified";
}
