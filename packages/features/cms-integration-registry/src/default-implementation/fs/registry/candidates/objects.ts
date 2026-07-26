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
import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";
import { readCanonicalJsonFile, writeCanonicalJsonNoReplace } from "../persistence/canonicalFile";
import { readVerifiedRegistryDirectory } from "../persistence/ownedDirectory";
import { FsIntegrationRegistryCandidateStoreError } from "./errors";
import { candidatePackagePath, candidateVerificationPath, type FsIntegrationRegistryCandidateLayout } from "./layout";

export type FsIntegrationRegistryCandidateObjects = Readonly<{
    package: IntegrationPackageEnvelopeV1;
    verification: IntegrationVerificationEnvelopeV1;
}>;

export async function persistFsIntegrationRegistryCandidateObjects(
    layout: FsIntegrationRegistryCandidateLayout,
    candidate: ValidatedIntegrationCandidateEnvelopeV1,
): Promise<ValidatedIntegrationCandidateEnvelopeV1> {
    const validated = await validateIntegrationCandidateEnvelope(candidate.envelope);
    if (
        validated.packageDigest !== candidate.packageDigest ||
        validated.verificationDigest !== candidate.verificationDigest
    ) {
        corrupt("Validated candidate digests changed during persistence");
    }
    await writeOrVerifyPackage(layout, validated.envelope.package, validated.packageDigest);
    await writeOrVerifyVerification(layout, validated.envelope.verification, validated.verificationDigest);
    return validated;
}

export async function readFsIntegrationRegistryCandidateObjects(
    layout: FsIntegrationRegistryCandidateLayout,
    record: IntegrationRegistryCandidateRecord,
): Promise<FsIntegrationRegistryCandidateObjects> {
    const packageEnvelope = await readPackage(layout, record.packageDigest);
    const verification = await readVerification(layout, record.verificationDigest);
    if (
        packageEnvelope.kind !== record.kind ||
        packageEnvelope.version !== record.version ||
        verification.target.kind !== record.kind ||
        verification.target.version !== record.version ||
        verification.target.packageDigest !== record.packageDigest
    ) {
        corrupt(`Candidate ${record.candidateId} object identities do not match its record`);
    }
    return Object.freeze({ package: packageEnvelope, verification });
}

export async function readPackage(
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

export async function readVerification(
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

async function writeOrVerifyPackage(
    layout: FsIntegrationRegistryCandidateLayout,
    envelope: IntegrationPackageEnvelopeV1,
    digest: string,
): Promise<void> {
    const path = candidatePackagePath(layout, digest);
    try {
        await writeCanonicalJsonNoReplace(path, envelope, DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes);
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
        await readPackage(layout, digest);
    }
}

async function writeOrVerifyVerification(
    layout: FsIntegrationRegistryCandidateLayout,
    envelope: IntegrationVerificationEnvelopeV1,
    digest: string,
): Promise<void> {
    const path = candidateVerificationPath(layout, digest);
    try {
        await writeCanonicalJsonNoReplace(path, envelope, DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes);
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
        await readVerification(layout, digest);
    }
}

function corrupt(message: string): never {
    throw new FsIntegrationRegistryCandidateStoreError("corrupt_candidate", message);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
