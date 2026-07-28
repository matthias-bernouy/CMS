import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { validateIntegrationCandidateEnvelope } from "@bernouy/cms-integration-verification";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { compare as compareSemVer } from "semver";
import type { BuiltIntegrationCandidate } from "./contracts";
import { IntegrationCandidateBuildError } from "./errors";
import { loadIntegrationVerificationBundle } from "./verification";

export async function buildIntegrationCandidates(root: string): Promise<readonly BuiltIntegrationCandidate[]> {
    const repository = new FsIntegrationDefinitionRepository(root);
    let summaries;
    try {
        summaries = await repository.list();
    } catch {
        throw new IntegrationCandidateBuildError(
            "source_invalid",
            "Selected integration root must be a readable, non-symlink integration repository",
        );
    }
    if (summaries.length !== 1) {
        throw new IntegrationCandidateBuildError(
            "source_shape_invalid",
            "Selected integration root must contain exactly one integration",
        );
    }
    const summary = summaries[0]!;
    const versions = [...summary.versions].sort(compareVersions);
    const candidates: BuiltIntegrationCandidate[] = [];
    for (const version of versions) {
        candidates.push(await buildVersionCandidate(root, repository, summary.kind, version));
    }
    return Object.freeze(candidates);
}

async function buildVersionCandidate(
    root: string,
    repository: FsIntegrationDefinitionRepository,
    kind: string,
    version: string,
): Promise<BuiltIntegrationCandidate> {
    let location;
    try {
        location = await repository.locateExactVersion(kind, version);
    } catch {
        throw new IntegrationCandidateBuildError(
            "package_invalid",
            `Runtime package for version ${version} is invalid; check its index, definition, and version files`,
        );
    }
    if (!location) {
        throw new IntegrationCandidateBuildError(
            "version_missing",
            `Runtime package for declared version ${version} could not be located`,
        );
    }
    if (!location.releaseNotes) {
        throw new IntegrationCandidateBuildError(
            "release_notes_missing",
            `Release notes are required for version ${version}`,
        );
    }

    let integrationPackage;
    try {
        integrationPackage = await readIntegrationPackageDirectory({
            root: location.root,
            kind,
            version,
            definition: location.definition,
            releaseNotes: location.releaseNotes,
        });
    } catch {
        throw new IntegrationCandidateBuildError(
            "package_invalid",
            `Runtime package for version ${version} is invalid; check its definition, release notes, and version files`,
        );
    }
    const verification = await loadIntegrationVerificationBundle(root, {
        kind,
        version,
        packageDigest: integrationPackage.digest,
    });
    try {
        const candidate = await validateIntegrationCandidateEnvelope({
            schema: "cms.integration.candidate.v1",
            package: integrationPackage.envelope,
            verification,
            submission: { requestedChannel: "latest" },
        });
        return Object.freeze({
            kind,
            version,
            packageDigest: candidate.packageDigest,
            verificationDigest: candidate.verificationDigest,
            candidateDigest: candidate.candidateDigest,
            canonicalBytes: canonicalJsonBytes(candidate.envelope),
        });
    } catch {
        throw new IntegrationCandidateBuildError(
            "candidate_invalid",
            `Candidate composition failed for version ${version}; check the runtime package and verification target`,
        );
    }
}

function compareVersions(left: string, right: string): number {
    return compareSemVer(left, right) || compareText(left, right);
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}
