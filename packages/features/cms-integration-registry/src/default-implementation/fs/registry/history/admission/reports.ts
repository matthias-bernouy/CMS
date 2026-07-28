import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    composeReleaseAdmissionDecision,
    identifyStatefulChangeSelection,
    type IdentifiedStatefulChangeSelectionV1,
    type MigrationReport,
    type ReleaseAdmissionDecision,
    type ReportProvenance,
} from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCatalogSnapshot } from "../../../../../interfaces/catalog";
import type {
    IntegrationCompatibilityV2ReportStore,
    IntegrationMigrationReportStore,
    IntegrationVerificationReportStore,
} from "../../../../../interfaces/reportStore";
import { currentRequiredMigrationReports } from "./migrations";

export async function currentAdmissionInputs(input: {
    snapshot: IntegrationRegistryCatalogSnapshot;
    compatibility: IntegrationCompatibilityV2ReportStore;
    verification: IntegrationVerificationReportStore;
    migrations: IntegrationMigrationReportStore;
    current: ReleaseAdmissionDecision;
}) {
    const compatibility = await input.compatibility.get(input.current.kind, input.current.version);
    if (!compatibility) {
        throw new Error("Current compatibility report is missing for release admission reconciliation");
    }
    const verification = await input.verification.get(input.current.kind, input.current.version);
    const migrations = await currentRequiredMigrationReports({
        snapshot: input.snapshot,
        migrations: input.migrations,
        current: input.current,
    });
    return { compatibility, verification, migrations };
}

export function admissionInputsAreCurrent(
    decision: ReleaseAdmissionDecision,
    input: Awaited<ReturnType<typeof currentAdmissionInputs>>,
): boolean {
    if (!sameReference(decision.compatibilityReport, input.compatibility)) {
        return false;
    }
    if (decision.verificationReport) {
        if (!input.verification || !sameReference(decision.verificationReport, input.verification)) {
            return false;
        }
    } else if (input.verification) {
        return false;
    }
    return (
        decision.migrationReports.length === input.migrations.length &&
        decision.migrationReports.every((reference, index) => {
            const history = input.migrations[index];
            return Boolean(history && sameReference(reference, history));
        })
    );
}

export async function composeCurrentAdmissionDecision(input: {
    previous: ReleaseAdmissionDecision;
    previousDigest: string;
    reports: Awaited<ReturnType<typeof currentAdmissionInputs>>;
    provenance: ReportProvenance;
    statefulChanges?: IdentifiedStatefulChangeSelectionV1;
}): Promise<ReleaseAdmissionDecision> {
    const compatibilityReference = {
        revisionId: input.reports.compatibility.currentRevisionId,
        reportDigest: input.reports.compatibility.currentReportDigest,
    };
    const statefulChanges =
        input.statefulChanges ??
        (await identifyStatefulChangeSelection({
            ...input.previous.statefulChanges,
            compatibilityReport: compatibilityReference,
        }));
    const migrationHistories = input.statefulChanges
        ? input.reports.migrations.filter((history) =>
              statefulChanges.selection.requiredMigrations.some(
                  (requirement) =>
                      requirement.source.kind === history.current.source.kind &&
                      requirement.source.version === history.current.source.version &&
                      requirement.source.packageDigest === history.current.source.packageDigest &&
                      requirement.connectorKey === history.current.connectorKey &&
                      requirement.lineageId === history.current.lineageId,
              ),
          )
        : input.reports.migrations;
    const reportReferences = {
        previousDecision: { revisionId: input.previous.decisionId, digest: input.previousDigest },
        compatibility: compatibilityReference,
        verification: input.reports.verification
            ? {
                  revisionId: input.reports.verification.currentRevisionId,
                  reportDigest: input.reports.verification.currentReportDigest,
              }
            : null,
        migrations: migrationHistories.map((history) => ({
            revisionId: history.currentRevisionId,
            reportDigest: history.currentReportDigest,
        })),
    };
    const seed = await sha256Hex(
        canonicalJsonBytes({ schema: "cms.integration.release-admission-reconciliation.v1", ...reportReferences }),
    );
    return await composeReleaseAdmissionDecision({
        decisionId: `reconcile-${seed.slice(0, 48)}`,
        revisionType: "revision",
        supersedes: input.previous.decisionId,
        compatibility: input.reports.compatibility.current,
        ...(input.reports.verification ? { verification: input.reports.verification.current } : {}),
        migrations: migrationHistories.map((history) => history.current) as readonly MigrationReport[],
        statefulChanges,
        policy: input.previous.policy,
        policySnapshotDigest: input.previous.policySnapshotDigest,
        createdAt: newestTimestamp(input.previous, { ...input.reports, migrations: migrationHistories }),
        provenance: input.provenance,
    });
}

function newestTimestamp(
    decision: ReleaseAdmissionDecision,
    reports: Awaited<ReturnType<typeof currentAdmissionInputs>>,
): string {
    const values = [
        decision.createdAt,
        reports.compatibility.current.createdAt,
        ...(reports.verification ? [reports.verification.current.createdAt] : []),
        ...reports.migrations.map((history) => history.current.createdAt),
    ];
    return values.reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest));
}

function sameReference(
    reference: Readonly<{ revisionId: string; reportDigest: string }>,
    history: Readonly<{ currentRevisionId: string; currentReportDigest: string }>,
): boolean {
    return reference.revisionId === history.currentRevisionId && reference.reportDigest === history.currentReportDigest;
}
