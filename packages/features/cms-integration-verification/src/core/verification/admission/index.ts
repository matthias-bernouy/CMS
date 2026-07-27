import type { AdmissionInputSnapshotV1, IdentifiedAdmissionInputSnapshotV1 } from "../../../interfaces/verification";
import { ADMISSION_INPUT_SNAPSHOT_SCHEMA } from "../../../interfaces/verification";
import { pinnedRunner } from "../../runner";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import { sha256Digest } from "../../validation/values";
import { identifyReleaseAdmissionPolicySnapshot } from "../policy";
import {
    compareText,
    identifyCanonicalVerificationContract,
    invalidReference,
    parseVerificationControlDocument,
    samePinnedRunner,
} from "../shared";
import { assertContractSuites, assertPlatformSuites } from "./assertions";
import {
    compareBaseline,
    compareDependency,
    parseActiveContract,
    parseCandidate,
    parseCompatibilityRevision,
    parseDependency,
    parseReviewedBaseline,
    parseRevision,
    parseSuite,
} from "./fields";

export {
    identifyIntegrationVerificationSuiteContent,
    validateIntegrationVerificationSuiteContent,
    type IdentifiedIntegrationVerificationSuiteContentV2,
} from "./suiteContent";
export { validateBoundIntegrationVerificationAuthorSuites } from "./suiteBinding";

export function parseAdmissionInputSnapshot(input: string | Uint8Array): AdmissionInputSnapshotV1 {
    return validateAdmissionInputSnapshot(parseVerificationControlDocument(input));
}

export function validateAdmissionInputSnapshot(value: unknown): AdmissionInputSnapshotV1 {
    assertContractIJson(value);
    const input = strictRecord(value, "admission", [
        "schema",
        "candidate",
        "policyDigest",
        "selectedRunner",
        "reviewedBaselines",
        "dependencies",
        "activeContracts",
        "suites",
        "catalogRevision",
        "compatibilityRevision",
    ]);
    if (input.schema !== ADMISSION_INPUT_SNAPSHOT_SCHEMA) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `admission.schema must be ${ADMISSION_INPUT_SNAPSHOT_SCHEMA}`,
            "admission.schema",
        );
    }
    const reviewedBaselines = boundedArray(
        input.reviewedBaselines,
        "admission.reviewedBaselines",
        parseReviewedBaseline,
    ).toSorted(compareBaseline);
    assertUnique(
        reviewedBaselines.map(
            (entry) =>
                `${entry.kind}\0${entry.version}\0${entry.packageDigest}\0${entry.connectorKey}\0${entry.lineageId}`,
        ),
        "admission.reviewedBaselines identity",
    );
    const dependencies = boundedArray(input.dependencies, "admission.dependencies", parseDependency).toSorted(
        compareDependency,
    );
    assertUnique(
        dependencies.map(
            (entry) => `${entry.selection ?? "legacy"}\0${entry.kind}\0${entry.version}\0${entry.packageDigest}`,
        ),
        "admission.dependencies identity",
    );
    const activeContracts = boundedArray(
        input.activeContracts,
        "admission.activeContracts",
        parseActiveContract,
    ).toSorted((left, right) => compareText(left.contractId, right.contractId));
    assertUnique(
        activeContracts.map((entry) => entry.contractId),
        "admission.activeContracts.contractId",
    );
    const suites = boundedArray(input.suites, "admission.suites", parseSuite, { minimum: 1 }).toSorted((left, right) =>
        compareText(left.suiteId, right.suiteId),
    );
    assertUnique(
        suites.map((entry) => entry.suiteId),
        "admission.suites.suiteId",
    );
    assertContractSuites(activeContracts, suites);
    return {
        schema: ADMISSION_INPUT_SNAPSHOT_SCHEMA,
        candidate: parseCandidate(input.candidate),
        policyDigest: sha256Digest(input.policyDigest, "admission.policyDigest"),
        selectedRunner: pinnedRunner(input.selectedRunner, "admission.selectedRunner"),
        reviewedBaselines,
        dependencies,
        activeContracts,
        suites,
        catalogRevision: parseRevision(input.catalogRevision, "admission.catalogRevision"),
        compatibilityRevision: parseCompatibilityRevision(input.compatibilityRevision),
    };
}

export async function identifyAdmissionInputSnapshot(value: unknown): Promise<IdentifiedAdmissionInputSnapshotV1> {
    const snapshot = validateAdmissionInputSnapshot(value);
    const identified = await identifyCanonicalVerificationContract(snapshot);
    return { snapshot, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}

export async function validateAdmissionInputSnapshotForPolicy(
    value: unknown,
    policyValue: unknown,
): Promise<IdentifiedAdmissionInputSnapshotV1> {
    const policy = await identifyReleaseAdmissionPolicySnapshot(policyValue);
    const admission = await identifyAdmissionInputSnapshot(value);
    if (admission.snapshot.policyDigest !== policy.digest) {
        invalidReference("admission.policyDigest", "does not identify the supplied policy snapshot");
    }
    if (
        !policy.snapshot.approvedRunners.some((runner) => samePinnedRunner(runner, admission.snapshot.selectedRunner))
    ) {
        invalidReference("admission.selectedRunner", "must be an exact runner approved by policy");
    }
    assertPlatformSuites(admission.snapshot, policy.snapshot);
    return admission;
}
