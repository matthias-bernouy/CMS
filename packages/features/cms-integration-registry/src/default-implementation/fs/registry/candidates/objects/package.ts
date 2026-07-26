import {
    computeIntegrationPackageDigest,
    DEFAULT_INTEGRATION_PACKAGE_LIMITS,
    validateIntegrationPackageEnvelope,
    type IntegrationPackageEnvelopeV1,
} from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    validateIntegrationCandidateEnvelope,
    validateIntegrationVerificationEnvelope,
    type IntegrationVerificationEnvelopeV1,
    type ValidatedIntegrationCandidateEnvelopeV1,
} from "@bernouy/cms-integration-verification";
import { readCanonicalJsonFile, writeCanonicalJsonNoReplace } from "../../persistence/canonicalFile";
import { readVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import { candidatePackagePath, candidateVerificationPath, type FsIntegrationRegistryCandidateLayout } from "../layout";
import { corrupt, writeOrVerifyObject } from "./shared";

export async function persistCandidatePackageObjects(
    layout: FsIntegrationRegistryCandidateLayout,
    candidate: ValidatedIntegrationCandidateEnvelopeV1,
): Promise<ValidatedIntegrationCandidateEnvelopeV1> {
    const validated = await validateIntegrationCandidateEnvelope(candidate.envelope);
    if (
        validated.candidateDigest !== candidate.candidateDigest ||
        validated.packageDigest !== candidate.packageDigest ||
        validated.verificationDigest !== candidate.verificationDigest
    ) {
        corrupt("Validated candidate digests changed during persistence");
    }
    await writeOrVerifyObject(
        layout,
        layout.packages,
        candidatePackagePath(layout, validated.packageDigest),
        validated.envelope.package,
        DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes,
        () => readCandidatePackage(layout, validated.packageDigest),
    );
    await writeOrVerifyObject(
        layout,
        layout.verifications,
        candidateVerificationPath(layout, validated.verificationDigest),
        validated.envelope.verification,
        DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes,
        () => readCandidateVerification(layout, validated.verificationDigest),
    );
    return validated;
}

export async function readCandidatePackage(
    layout: FsIntegrationRegistryCandidateLayout,
    digest: string,
): Promise<IntegrationPackageEnvelopeV1> {
    const path = candidatePackagePath(layout, digest);
    await readVerifiedRegistryDirectory(layout.packages);
    const value = await readCanonicalJsonFile(path, DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes);
    if (value === null) {
        corrupt(`Candidate package object ${digest} is missing`);
    }
    const envelope = validateIntegrationPackageEnvelope(value, { requireReleaseNotes: true });
    if ((await computeIntegrationPackageDigest(envelope)) !== digest) {
        corrupt(`Candidate package object ${digest} does not match its path digest`);
    }
    await readVerifiedRegistryDirectory(layout.packages);
    return envelope;
}

export async function readCandidateVerification(
    layout: FsIntegrationRegistryCandidateLayout,
    digest: string,
): Promise<IntegrationVerificationEnvelopeV1> {
    const path = candidateVerificationPath(layout, digest);
    await readVerifiedRegistryDirectory(layout.verifications);
    const value = await readCanonicalJsonFile(path, DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes);
    if (value === null) {
        corrupt(`Candidate verification object ${digest} is missing`);
    }
    const envelope = validateIntegrationVerificationEnvelope(value);
    if ((await computeIntegrationVerificationDigest(envelope)) !== digest) {
        corrupt(`Candidate verification object ${digest} does not match its path digest`);
    }
    await readVerifiedRegistryDirectory(layout.verifications);
    return envelope;
}
