import {
    identifyReviewedSchemaBaseline,
    type AdmissionReviewedBaselineReferenceV1,
} from "@bernouy/cms-integration-verification";
import type { RepositoryCandidateReviewedSchemaBaselineResolver } from "../contracts";

type BaselineTarget = Readonly<{ kind: string; version: string; packageDigest: string }>;

export async function resolveReviewedSchemaBaselines(
    target: BaselineTarget,
    references: readonly AdmissionReviewedBaselineReferenceV1[],
    resolver?: RepositoryCandidateReviewedSchemaBaselineResolver,
) {
    const expected = references.filter(
        (entry) =>
            entry.kind === target.kind &&
            entry.version === target.version &&
            entry.packageDigest === target.packageDigest,
    );
    const resolved = resolver ? await resolver.resolve(target) : [];
    if (resolved.length !== expected.length) {
        throw new Error(`Exact reviewed schema baselines for ${target.kind}@${target.version} are unavailable`);
    }
    const identified = await Promise.all(resolved.map(identifyReviewedSchemaBaseline));
    return Object.freeze(
        expected.map((reference) => {
            const match = identified.find(
                ({ baseline, digest }) =>
                    baseline.kind === reference.kind &&
                    baseline.version === reference.version &&
                    baseline.packageDigest === reference.packageDigest &&
                    baseline.connectorKey === reference.connectorKey &&
                    baseline.lineageId === reference.lineageId &&
                    baseline.reportId === reference.revisionId &&
                    baseline.observedSchemaDigest === reference.observedSchemaDigest &&
                    digest === reference.baselineDigest,
            );
            if (!match) {
                throw new Error(`Exact reviewed schema baseline ${reference.revisionId} is unavailable`);
            }
            return match.baseline;
        }),
    );
}
