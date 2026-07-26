import {
    composeReleaseAdmissionDecision,
    identifyCompatibilityReportV2,
    identifyStatefulChangeSelection,
} from "@bernouy/cms-integration-verification";
import {
    compatibilityReport,
    CREATED_AT,
    migrationReport,
    POLICY_DIGEST,
    releasePolicy,
    releaseProvenance,
    verificationReport,
} from "./reports";

export async function completeDecisionEvidence(sourceDigest: string, targetDigest: string) {
    const compatibility = await compatibilityReport(sourceDigest, targetDigest);
    const compatibilityIdentity = await identifyCompatibilityReportV2(compatibility);
    const statefulChanges = await identifyStatefulChangeSelection({
        schema: "cms.integration.stateful-change-selection.v1",
        selector: releasePolicy(),
        policySnapshotDigest: POLICY_DIGEST,
        target: { kind: "demo", version: "1.1.0", packageDigest: targetDigest },
        compatibilityReport: { revisionId: compatibility.reportId, reportDigest: compatibilityIdentity.digest },
        requiredMigrations: [
            {
                source: { kind: "demo", version: "1.0.0", packageDigest: sourceDigest },
                connectorKey: "primary",
                lineageId: "demo-supabase-v1",
            },
        ],
    });
    const verification = verificationReport(targetDigest);
    const migration = await migrationReport(sourceDigest, targetDigest, statefulChanges.digest);
    const decision = await composeReleaseAdmissionDecision({
        decisionId: "decision-1",
        revisionType: "root",
        compatibility,
        verification,
        migrations: [migration],
        statefulChanges,
        policy: releasePolicy(),
        policySnapshotDigest: POLICY_DIGEST,
        createdAt: CREATED_AT,
        provenance: releaseProvenance(),
    });
    return { compatibility, verification, migration, decision, statefulChanges };
}
