import {
    identifyAdmissionInputSnapshot,
    identifyReleaseAdmissionPolicySnapshot,
    identifyVerificationJobResult,
    type AdmissionInputSnapshotV1,
    type ReleaseAdmissionPolicySnapshotV1,
    type VerificationJobResultV1,
} from "@bernouy/cms-integration-verification";
import { readCanonicalJsonFile } from "../../persistence/canonicalFile";
import { readVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";
import {
    candidateAdmissionPath,
    candidatePolicyPath,
    candidateResultPath,
    FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT,
    type FsIntegrationRegistryCandidateLayout,
} from "../layout";
import { corrupt, writeOrVerifyObject } from "./shared";

export async function persistCandidateAdmissionObjects(
    layout: FsIntegrationRegistryCandidateLayout,
    policy: ReleaseAdmissionPolicySnapshotV1,
    admission: AdmissionInputSnapshotV1,
): Promise<Readonly<{ policyDigest: string; admissionInputDigest: string }>> {
    const identifiedPolicy = await identifyReleaseAdmissionPolicySnapshot(policy);
    const identifiedAdmission = await identifyAdmissionInputSnapshot(admission);
    await writeOrVerifyObject(
        layout,
        layout.policies,
        candidatePolicyPath(layout, identifiedPolicy.digest),
        identifiedPolicy.snapshot,
        FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT,
        () => readCandidatePolicy(layout, identifiedPolicy.digest),
    );
    await writeOrVerifyObject(
        layout,
        layout.admissions,
        candidateAdmissionPath(layout, identifiedAdmission.digest),
        identifiedAdmission.snapshot,
        FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT,
        () => readCandidateAdmission(layout, identifiedAdmission.digest),
    );
    return { policyDigest: identifiedPolicy.digest, admissionInputDigest: identifiedAdmission.digest };
}

export async function persistCandidateVerificationJobResult(
    layout: FsIntegrationRegistryCandidateLayout,
    result: VerificationJobResultV1,
): Promise<string> {
    const identified = await identifyVerificationJobResult(result);
    await writeOrVerifyObject(
        layout,
        layout.results,
        candidateResultPath(layout, identified.digest),
        identified.result,
        FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT,
        () => readCandidateVerificationJobResult(layout, identified.digest),
    );
    return identified.digest;
}

export async function readCandidatePolicy(
    layout: FsIntegrationRegistryCandidateLayout,
    digest: string,
): Promise<ReleaseAdmissionPolicySnapshotV1> {
    return await readControlObject(layout.policies, candidatePolicyPath(layout, digest), digest, async (value) =>
        identifyReleaseAdmissionPolicySnapshot(value),
    );
}

export async function readCandidateAdmission(
    layout: FsIntegrationRegistryCandidateLayout,
    digest: string,
): Promise<AdmissionInputSnapshotV1> {
    return await readControlObject(layout.admissions, candidateAdmissionPath(layout, digest), digest, async (value) =>
        identifyAdmissionInputSnapshot(value),
    );
}

export async function readCandidateVerificationJobResult(
    layout: FsIntegrationRegistryCandidateLayout,
    digest: string,
): Promise<VerificationJobResultV1> {
    return await readControlObject(layout.results, candidateResultPath(layout, digest), digest, async (value) =>
        identifyVerificationJobResult(value),
    );
}

async function readControlObject<T>(
    root: string,
    path: string,
    digest: string,
    identify: (value: unknown) => Promise<Readonly<{ digest: string; snapshot?: T; result?: T }>>,
): Promise<T> {
    await readVerifiedRegistryDirectory(root);
    const value = await readCanonicalJsonFile(path, FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT);
    if (value === null) {
        corrupt(`Candidate control object ${digest} is missing`);
    }
    const identified = await identify(value);
    if (identified.digest !== digest) {
        corrupt(`Candidate control object ${digest} does not match its path digest`);
    }
    await readVerifiedRegistryDirectory(root);
    const parsed = identified.snapshot ?? identified.result;
    if (!parsed) {
        corrupt(`Candidate control object ${digest} has no validated value`);
    }
    return parsed;
}
