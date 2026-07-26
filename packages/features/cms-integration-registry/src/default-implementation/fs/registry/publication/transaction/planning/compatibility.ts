import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    createCompatibilityFinding,
    deriveCompatibilityReportAssessment,
    identifyCompatibilityReportV2,
    type CompatibilityReportV2,
    type ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import { IntegrationCompatibilityEvaluator } from "cms-integration-registry/core/compatibility/evaluation";
import type { IntegrationRegistryCatalogSnapshot } from "cms-integration-registry/interfaces/catalog";
import type { IntegrationCompatibilityAdmissionReport } from "cms-integration-registry/interfaces/compatibility";
import { evaluatePublicationCompatibilityDecision } from "../../compatibility";
import type { PreparedFsIntegrationRegistryCandidate } from "../../candidate";
import type { CapturedReviewedSchemaBaselineStore } from "./baselines";
import type { IdentifiedCatalogRevision } from "./catalog";

export type PlannedCompatibility = Readonly<{
    report: CompatibilityReportV2;
    reportDigest: string;
    evaluatorInputDigest: string;
}>;

export async function planCandidateCompatibility(input: {
    snapshot: IntegrationRegistryCatalogSnapshot;
    catalog: IdentifiedCatalogRevision;
    candidate: PreparedFsIntegrationRegistryCandidate;
    candidateDigest: string;
    createdAt: string;
    policy: ReleaseAdmissionPolicySnapshotV1;
    baselines: CapturedReviewedSchemaBaselineStore;
}): Promise<PlannedCompatibility> {
    const evaluator = new IntegrationCompatibilityEvaluator({
        identity: input.policy.staticEvaluator,
        now: () => input.createdAt,
        createReportId: () => `legacy-${input.candidateDigest.slice(0, 32)}`,
    });
    const legacy = (
        await evaluatePublicationCompatibilityDecision(
            input.snapshot,
            input.candidate,
            evaluator,
            undefined,
            input.baselines,
        )
    ).report;
    const findings = await findingsFromLegacy(legacy);
    const assessment = deriveCompatibilityReportAssessment({
        effectiveFindings: findings,
        releaseLevel: legacy.releaseLevel,
        ...(legacy.noBaselineReason ? { noBaselineReason: legacy.noBaselineReason } : {}),
    });
    const report = await identifyCompatibilityReportV2({
        schema: "cms.integration.compatibility-report.v2",
        reportId: `compat-${input.candidateDigest.slice(0, 32)}`,
        revisionType: "root",
        origin: "admission",
        createdAt: input.createdAt,
        kind: legacy.kind,
        version: legacy.version,
        packageDigest: legacy.packageDigest,
        evaluator: input.policy.staticEvaluator,
        baselines: legacy.baselines,
        informationalBaselines: legacy.informationalBaselines,
        findings,
        ...assessment,
        releaseLevel: legacy.releaseLevel,
        ...(legacy.noBaselineReason ? { noBaselineReason: legacy.noBaselineReason } : {}),
        provenance: { actor: "repository-admission", reason: "candidate-static-evaluation" },
    });
    const evaluatorInputDigest = await sha256Hex(
        canonicalJsonBytes({
            schema: "cms.integration.compatibility-evaluator-input.v1",
            catalogDigest: input.catalog.digest,
            candidate: {
                kind: legacy.kind,
                version: legacy.version,
                packageDigest: legacy.packageDigest,
            },
            baselines: legacy.baselines,
            informationalBaselines: legacy.informationalBaselines,
            reviewedBaselines: input.baselines.references(),
            evaluator: input.policy.staticEvaluator,
        }),
    );
    return Object.freeze({ report: report.report, reportDigest: report.digest, evaluatorInputDigest });
}

async function findingsFromLegacy(report: IntegrationCompatibilityAdmissionReport) {
    const baselineDigest =
        report.baselines[0]?.packageDigest ?? report.informationalBaselines[0]?.packageDigest ?? report.packageDigest;
    const grouped = new Map<string, IntegrationCompatibilityAdmissionReport["evidence"][number]>();
    for (const entry of report.evidence) {
        const key = `${entry.surface}\0${entry.path}\0${entry.code}`;
        const previous = grouped.get(key);
        if (!previous || compareEvidenceSeverity(entry, previous) > 0) {
            grouped.set(key, entry);
        }
    }
    return await Promise.all(
        [...grouped.values()].map((entry) =>
            createCompatibilityFinding({
                surface: entry.surface,
                path: entry.path,
                code: entry.code,
                baselineDigest,
                candidateDigest: report.packageDigest,
                classification: entry.classification,
                message: entry.message,
            }),
        ),
    );
}

function compareEvidenceSeverity(
    left: IntegrationCompatibilityAdmissionReport["evidence"][number],
    right: IntegrationCompatibilityAdmissionReport["evidence"][number],
): number {
    const rank = { compatible: 0, additive: 1, breaking: 2, unknown: 3, invalid: 4 } as const;
    return rank[left.classification] - rank[right.classification] || (left.message < right.message ? 1 : -1);
}
