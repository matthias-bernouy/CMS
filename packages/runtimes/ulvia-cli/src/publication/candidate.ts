import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { validateIntegrationCandidateEnvelope } from "@bernouy/cms-integration-verification";
import type { LocalIntegrationRepository } from "../repository/local";
import type { LocalPackageRecord } from "../repository/manifest";
import type { BuiltLocalCandidate } from "./contracts";

export async function buildLocalCandidate(
    local: LocalIntegrationRepository,
    record: LocalPackageRecord,
): Promise<BuiltLocalCandidate> {
    if (!record.source.startsWith("local:")) {
        throw new Error(`${record.kind}@${record.version} was not released locally and cannot be pushed`);
    }
    const [integrationPackage, verification] = await Promise.all([
        local.getPackage(record),
        local.getVerification(record),
    ]);
    if (!verification || !record.verificationDigest) {
        throw new Error(`${record.kind}@${record.version} has no immutable local verification bundle`);
    }
    const candidate = await validateIntegrationCandidateEnvelope({
        schema: "cms.integration.candidate.v1",
        package: integrationPackage.envelope,
        verification: verification.envelope,
        submission: { requestedChannel: "latest" },
    });
    if (
        candidate.packageDigest !== record.digest ||
        candidate.verificationDigest !== record.verificationDigest ||
        verification.digest !== record.verificationDigest
    ) {
        throw new Error(`${record.kind}@${record.version} no longer matches its immutable local digests`);
    }
    return Object.freeze({
        kind: record.kind,
        version: record.version,
        packageDigest: candidate.packageDigest,
        verificationDigest: candidate.verificationDigest,
        candidateDigest: candidate.candidateDigest,
        canonicalBytes: canonicalJsonBytes(candidate.envelope),
    });
}
