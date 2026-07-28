import {
    identifyReleaseAdmissionDecision,
    identifyReleaseAdmissionPolicySnapshot,
} from "@bernouy/cms-integration-verification";
import {
    IntegrationRegistryVersionEligibilityConflictError,
    IntegrationRegistryVersionEligibilityStaleDecisionError,
} from "../../../../../core/promotion/eligibilityErrors";
import { admissionInputsAreCurrent, composeCurrentAdmissionDecision, currentAdmissionInputs } from "./reports";
import type {
    FsReleaseAdmissionReconcilerConfig,
    ReleaseAdmissionReconciliationProvenance,
    ReleaseAdmissionReconciliationResult,
} from "./types";
import { CapturedReviewedSchemaBaselineStore } from "../../publication/transaction/planning/baselines";
import { selectStatefulChanges } from "../../publication/transaction/planning/stateful";

export class FsReleaseAdmissionReconciler {
    constructor(private readonly config: FsReleaseAdmissionReconcilerConfig) {}

    async reconcile(
        kind: string,
        version: string,
        provenance: ReleaseAdmissionReconciliationProvenance,
    ): Promise<ReleaseAdmissionReconciliationResult | null> {
        const initial = await this.config.decisions.getHistory(kind, version);
        if (!initial) {
            return null;
        }
        const snapshot = this.config.snapshots.current();
        const reports = await currentAdmissionInputs({
            snapshot,
            compatibility: this.config.compatibility,
            verification: this.config.verification,
            migrations: this.config.migrations,
            current: initial.current,
        });
        let history = initial;
        let decisionChanged = false;
        if (!admissionInputsAreCurrent(initial.current, reports)) {
            const statefulChanges = await this.currentStatefulChanges(initial.current, reports);
            const decision = await composeCurrentAdmissionDecision({
                previous: initial.current,
                previousDigest: initial.currentReportDigest,
                reports,
                provenance,
                ...(statefulChanges ? { statefulChanges } : {}),
            });
            history = await this.config.decisions.append({
                report: decision,
                expectedCurrent: {
                    revisionId: initial.currentRevisionId,
                    reportDigest: initial.currentReportDigest,
                },
            });
            decisionChanged = true;
        }
        const eligibilityChanged = await this.repairEligibility(history, provenance);
        return Object.freeze({ decision: history, decisionChanged, eligibilityChanged });
    }

    private async currentStatefulChanges(
        previous: Parameters<typeof composeCurrentAdmissionDecision>[0]["previous"],
        reports: Awaited<ReturnType<typeof currentAdmissionInputs>>,
    ) {
        if (
            previous.compatibilityReport.revisionId === reports.compatibility.currentRevisionId &&
            previous.compatibilityReport.reportDigest === reports.compatibility.currentReportDigest
        ) {
            return null;
        }
        const configured = this.config.statefulChanges;
        if (!configured) {
            throw new Error("Compatibility revision changed without a trusted stateful-change policy snapshot");
        }
        const policy = await identifyReleaseAdmissionPolicySnapshot(configured.policy);
        if (
            policy.digest !== previous.policySnapshotDigest ||
            policy.snapshot.migrationPolicy.name !== previous.policy.name ||
            policy.snapshot.migrationPolicy.version !== previous.policy.version
        ) {
            throw new Error("Compatibility revision cannot reuse a different release admission policy snapshot");
        }
        const snapshot = this.config.snapshots.current();
        const baselines = new CapturedReviewedSchemaBaselineStore(configured.reviewedSchemaBaselines);
        for (const source of [
            ...reports.compatibility.current.baselines,
            ...reports.compatibility.current.informationalBaselines,
        ]) {
            await baselines.listForPackage(source.kind, source.version, source.packageDigest);
        }
        const selection = await selectStatefulChanges({
            snapshot,
            report: reports.compatibility.current,
            reportDigest: reports.compatibility.currentReportDigest,
            policy: policy.snapshot,
            policyDigest: policy.digest,
            baselines,
        });
        await baselines.assertStillCurrent();
        return selection;
    }

    async reconcileAll(provenance: ReleaseAdmissionReconciliationProvenance): Promise<void> {
        const snapshot = this.config.snapshots.current();
        for (const summary of snapshot.summaries) {
            for (const { version } of snapshot.listVersions(summary.kind)) {
                await this.reconcile(summary.kind, version, provenance);
            }
        }
    }

    private async repairEligibility(
        history: ReleaseAdmissionReconciliationResult["decision"],
        provenance: ReleaseAdmissionReconciliationProvenance,
    ): Promise<boolean> {
        if (history.current.admissible) {
            return false;
        }
        const index = this.config.snapshots.current().getIndex(history.current.kind);
        const entry = index?.versions.find((candidate) => candidate.version === history.current.version);
        if (!entry || entry.status === "blocked" || entry.status === "inadmissible") {
            return false;
        }
        const identified = await identifyReleaseAdmissionDecision(history.current);
        try {
            await this.config.eligibility.markVersionInadmissible({
                kind: history.current.kind,
                version: history.current.version,
                currentDecision: { revisionId: history.currentRevisionId, digest: identified.digest },
                actor: provenance.actor,
                reason: provenance.reason,
            });
            return true;
        } catch (error) {
            if (
                error instanceof IntegrationRegistryVersionEligibilityConflictError ||
                error instanceof IntegrationRegistryVersionEligibilityStaleDecisionError
            ) {
                const current = this.config.snapshots
                    .current()
                    .getIndex(history.current.kind)
                    ?.versions.find((candidate) => candidate.version === history.current.version);
                if (current?.status === "blocked" || current?.status === "inadmissible") {
                    return false;
                }
            }
            throw error;
        }
    }
}

export type {
    FsReleaseAdmissionReconcilerConfig,
    ReleaseAdmissionReconciliationProvenance,
    ReleaseAdmissionReconciliationResult,
} from "./types";
