import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    type CompatibilityReportV2,
    type ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import { IntegrationCompatibilityEvaluator } from "cms-integration-registry/core/compatibility/evaluation";
import { projectCompatibilityReportV2 } from "cms-integration-registry/core/compatibility/evaluation/v2Projection";
import type { IntegrationRegistryCatalogSnapshot } from "cms-integration-registry/interfaces/catalog";
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
    const report = await projectCompatibilityReportV2({
        report: legacy,
        history: {
            reportId: `compat-${input.candidateDigest.slice(0, 32)}`,
            revisionType: "root",
            origin: "admission",
            createdAt: input.createdAt,
        },
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
