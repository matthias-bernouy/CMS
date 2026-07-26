import { identifyReviewedSchemaBaseline, runnerSatisfiesRequirement } from "@bernouy/cms-integration-verification";
import { IntegrationVerificationBackfillError } from "../../../../../../core/publication/backfill";
import type { IdentifiedIntegrationVerificationBackfillRequest } from "../../../../../../interfaces/publication";
import type { FsIntegrationVerificationBackfillerConfig } from "../types";

export async function validateIntegrationVerificationBackfill(
    config: FsIntegrationVerificationBackfillerConfig,
    identified: IdentifiedIntegrationVerificationBackfillRequest,
): Promise<void> {
    if (!config.approvedRequestDigests.includes(identified.digest)) {
        throw new IntegrationVerificationBackfillError(
            422,
            "verification_backfill_unapproved",
            "Integration verification backfill request digest is not approved",
        );
    }
    const { request } = identified;
    const target = request.verification.envelope.target;
    const snapshot = config.snapshots.current();
    const location = snapshot.locateExactVersion(target.kind, target.version);
    if (!location || location.package.digest !== target.packageDigest) {
        throw new IntegrationVerificationBackfillError(
            404,
            "verification_backfill_not_found",
            "Integration verification backfill target is absent or substituted",
        );
    }
    if (
        !request.verification.envelope.manifest.runnerRequirements.every((requirement) =>
            runnerSatisfiesRequirement(request.verificationReport.runner, requirement),
        )
    ) {
        invalid("Verification backfill runner does not satisfy the immutable bundle requirements");
    }
    for (const dependency of request.verificationReport.dependencies) {
        const pinned = snapshot.locateExactVersion(dependency.kind, dependency.version);
        if (!pinned || pinned.package.digest !== dependency.packageDigest) {
            invalid(`Verification backfill dependency is absent or substituted: ${dependency.kind}`);
        }
    }
    for (const baseline of request.verificationReport.baselines) {
        const history = await config.reviewedSchemaBaselines.get({
            kind: baseline.kind,
            version: baseline.version,
            packageDigest: baseline.packageDigest,
            connectorKey: baseline.connectorKey,
            lineageId: baseline.lineageId,
        });
        const revision = history?.revisions.find(({ reportId }) => reportId === baseline.revisionId);
        if (
            !revision ||
            (await identifyReviewedSchemaBaseline(revision)).digest !== baseline.baselineDigest ||
            revision.observedSchemaDigest !== baseline.observedSchemaDigest
        ) {
            invalid(`Verification backfill reviewed baseline is absent or substituted: ${baseline.connectorKey}`);
        }
    }
    for (const baseline of [
        ...request.compatibilityReport.baselines,
        ...request.compatibilityReport.informationalBaselines,
    ]) {
        const pinned = snapshot.locateExactVersion(baseline.kind, baseline.version);
        if (!pinned || pinned.package.digest !== baseline.packageDigest) {
            invalid(`Compatibility backfill baseline is absent or substituted: ${baseline.kind}`);
        }
    }
}

function invalid(message: string): never {
    throw new IntegrationVerificationBackfillError(400, "verification_backfill_invalid", message);
}
