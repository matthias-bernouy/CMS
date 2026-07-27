import {
    IntegrationCompatibilityReevaluationIntegrityError,
    IntegrationCompatibilityReevaluationStaleDecisionError,
} from "../../../../core/compatibility/reevaluation/errors";
import type { IntegrationCompatibilityReevaluationRequest } from "../../../../interfaces/reevaluation";
import type { ReleaseAdmissionDecisionStore, ReleaseReportHistory } from "../../../../interfaces/reportStore";
import type { CompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import type { FsReleaseAdmissionReconciler } from "../history/admission";

export type ReleaseReevaluationConfig = Readonly<{
    decisions: ReleaseAdmissionDecisionStore;
    reconciler: Pick<FsReleaseAdmissionReconciler, "reconcile">;
}>;

export async function captureReleaseReevaluationContext(
    release: ReleaseReevaluationConfig,
    request: IntegrationCompatibilityReevaluationRequest,
    compatibility: ReleaseReportHistory<CompatibilityReportV2>,
) {
    const history = await release.decisions.get(request.kind, request.version);
    if (!history) {
        throw new IntegrationCompatibilityReevaluationIntegrityError(
            "Compatibility reevaluation requires current composite release evidence",
        );
    }
    if (
        !request.currentDecision ||
        request.currentDecision.revisionId !== history.currentRevisionId ||
        request.currentDecision.digest !== history.currentReportDigest
    ) {
        throw new IntegrationCompatibilityReevaluationStaleDecisionError(
            history.currentRevisionId,
            history.currentReportDigest,
        );
    }
    if (
        history.current.compatibilityReport.revisionId !== compatibility.currentRevisionId ||
        history.current.compatibilityReport.reportDigest !== compatibility.currentReportDigest
    ) {
        throw new IntegrationCompatibilityReevaluationIntegrityError(
            "Current release decision does not reference the current compatibility report",
        );
    }
    return { compatibility };
}

export async function reconcileReevaluatedRelease(input: {
    release: ReleaseReevaluationConfig;
    revision: CompatibilityReportV2;
}) {
    const reconciled = await input.release.reconciler.reconcile(input.revision.kind, input.revision.version, {
        actor: input.revision.provenance.actor,
        reason: input.revision.provenance.reason,
        ...(input.revision.provenance.evidenceIds ? { evidenceIds: input.revision.provenance.evidenceIds } : {}),
    });
    if (!reconciled) {
        throw new IntegrationCompatibilityReevaluationIntegrityError(
            "Composite release decision disappeared during compatibility reevaluation",
        );
    }
    return Object.freeze({
        compatibilityReportRevisionId: input.revision.reportId,
        decision: {
            revisionId: reconciled.decision.currentRevisionId,
            digest: reconciled.decision.currentReportDigest,
        },
        admissible: reconciled.decision.current.admissible,
        eligibilityChanged: reconciled.eligibilityChanged,
    });
}
