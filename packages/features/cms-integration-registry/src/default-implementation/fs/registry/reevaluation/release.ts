import type { IntegrationCompatibilityEvaluator } from "../../../../core/compatibility/evaluation";
import { projectCompatibilityReportV2 } from "../../../../core/compatibility/evaluation/v2Projection";
import {
    IntegrationCompatibilityReevaluationIntegrityError,
    IntegrationCompatibilityReevaluationStaleDecisionError,
} from "../../../../core/compatibility/reevaluation/errors";
import type { IntegrationCompatibilityReevaluationRequest } from "../../../../interfaces/reevaluation";
import type {
    IntegrationCompatibilityV2ReportStore,
    ReleaseAdmissionDecisionStore,
} from "../../../../interfaces/reportStore";
import type { FsReleaseAdmissionReconciler } from "../history/admission";

export type ReleaseReevaluationConfig = Readonly<{
    compatibility: IntegrationCompatibilityV2ReportStore;
    decisions: ReleaseAdmissionDecisionStore;
    reconciler: Pick<FsReleaseAdmissionReconciler, "reconcile">;
}>;

export async function captureReleaseReevaluationContext(
    release: ReleaseReevaluationConfig,
    request: IntegrationCompatibilityReevaluationRequest,
) {
    const history = await release.decisions.get(request.kind, request.version);
    const compatibility = await release.compatibility.get(request.kind, request.version);
    if (!history || !compatibility) {
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

export async function appendReleaseReevaluationRevision(input: {
    release: ReleaseReevaluationConfig;
    revision: Awaited<ReturnType<IntegrationCompatibilityEvaluator["evaluateRevision"]>>;
    context: Awaited<ReturnType<typeof captureReleaseReevaluationContext>>;
}) {
    const projected = await projectCompatibilityReportV2({
        report: input.revision,
        history: {
            reportId: `compat-${input.revision.id}`,
            revisionType: "revision",
            origin: input.context.compatibility.current.origin,
            createdAt: input.revision.createdAt,
            supersedes: input.context.compatibility.currentRevisionId,
        },
        provenance: input.revision.provenance,
    });
    const compatibility = await input.release.compatibility.append({
        report: projected.report,
        expectedCurrent: {
            revisionId: input.context.compatibility.currentRevisionId,
            reportDigest: input.context.compatibility.currentReportDigest,
        },
    });
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
        compatibilityReportRevisionId: compatibility.currentRevisionId,
        decision: {
            revisionId: reconciled.decision.currentRevisionId,
            digest: reconciled.decision.currentReportDigest,
        },
        admissible: reconciled.decision.current.admissible,
        eligibilityChanged: reconciled.eligibilityChanged,
    });
}
