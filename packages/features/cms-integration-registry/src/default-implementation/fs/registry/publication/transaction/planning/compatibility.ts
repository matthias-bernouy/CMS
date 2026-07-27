import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    type CompatibilityReportV2,
    type ReleaseAdmissionPolicySnapshotV1,
} from "@bernouy/cms-integration-verification";
import { IntegrationCompatibilityEvaluator } from "cms-integration-registry/core/compatibility/evaluation";
import { buildCompatibilityReportV2 } from "cms-integration-registry/core/compatibility/evaluation/reportBuilder";
import type { IntegrationRegistryCatalogSnapshot } from "cms-integration-registry/interfaces/catalog";
import { buildPublicationCompatibilityInput } from "../../compatibility";
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
        createReportId: () => `compat-${input.candidateDigest.slice(0, 32)}`,
    });
    const evaluation = evaluator.evaluate(
        await buildPublicationCompatibilityInput(input.snapshot, input.candidate, undefined, input.baselines),
    );
    const report = await buildCompatibilityReportV2({
        evaluation,
        evaluator: input.policy.staticEvaluator,
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
                kind: evaluation.kind,
                version: evaluation.version,
                packageDigest: evaluation.packageDigest,
            },
            baselines: evaluation.baselines,
            informationalBaselines: evaluation.informationalBaselines,
            reviewedBaselines: input.baselines.references(),
            evaluator: input.policy.staticEvaluator,
        }),
    );
    return Object.freeze({ report: report.report, reportDigest: report.digest, evaluatorInputDigest });
}
