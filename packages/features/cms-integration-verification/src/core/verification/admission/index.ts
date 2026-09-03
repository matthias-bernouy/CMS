import type { AdmissionInputSnapshotV1, IdentifiedAdmissionInputSnapshotV1 } from "../../../interfaces/verification";
import { ADMISSION_INPUT_SNAPSHOT_SCHEMA } from "../../../interfaces/verification";
import { integrationVersionReleaseLevel } from "@bernouy/cms-integrations";
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
import { BEHAVIORAL_RLS_PLATFORM_SUITE_ID, identifyBehavioralRlsPlan, validateBehavioralRlsPlan } from "../platform";
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
import { identifyReleaseVerificationPlan, validateReleaseVerificationPlan } from "./releasePlanContract";

export {
    identifyIntegrationVerificationSuiteContent,
    validateIntegrationVerificationSuiteContent,
    type IdentifiedIntegrationVerificationSuiteContentV2,
} from "./suiteContent";
export { validateBoundIntegrationVerificationAuthorSuites } from "./suiteBinding";
export { identifyReleaseMigrationStateKey, planReleaseVerification } from "./releasePlan";
export {
    assertReleaseVerificationPlanMatchesVerification,
    identifyReleaseVerificationPlan,
    validateReleaseVerificationPlan,
} from "./releasePlanContract";

export function parseAdmissionInputSnapshot(input: string | Uint8Array): AdmissionInputSnapshotV1 {
    return validateAdmissionInputSnapshot(parseVerificationControlDocument(input));
}

export function validateAdmissionInputSnapshot(value: unknown): AdmissionInputSnapshotV1 {
    assertContractIJson(value);
    const hasBehavioralRlsPlan = Boolean(
        value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "behavioralRlsPlan"),
    );
    const hasReleaseVerificationPlan = Boolean(
        value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "releaseVerificationPlan"),
    );
    const input = strictRecord(value, "admission", [
        "schema",
        "candidate",
        "policyDigest",
        "selectedRunner",
        "reviewedBaselines",
        "dependencies",
        "activeContracts",
        "suites",
        ...(hasBehavioralRlsPlan ? ["behavioralRlsPlan"] : []),
        ...(hasReleaseVerificationPlan ? ["releaseVerificationPlan"] : []),
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
    const candidate = parseCandidate(input.candidate);
    const policyDigest = sha256Digest(input.policyDigest, "admission.policyDigest");
    const behavioralRlsPlan = hasBehavioralRlsPlan ? parseBehavioralRlsPlanBinding(input.behavioralRlsPlan) : undefined;
    const releaseVerificationPlan = hasReleaseVerificationPlan
        ? parseReleaseVerificationPlanBinding(input.releaseVerificationPlan)
        : undefined;
    if (behavioralRlsPlan) {
        assertBehavioralRlsPlanReferences(behavioralRlsPlan.plan, candidate, policyDigest);
    }
    if (releaseVerificationPlan) {
        assertReleaseVerificationPlanReferences(releaseVerificationPlan.plan, candidate);
    }
    return {
        schema: ADMISSION_INPUT_SNAPSHOT_SCHEMA,
        candidate,
        policyDigest,
        selectedRunner: pinnedRunner(input.selectedRunner, "admission.selectedRunner"),
        reviewedBaselines,
        dependencies,
        activeContracts,
        suites,
        ...(behavioralRlsPlan ? { behavioralRlsPlan } : {}),
        ...(releaseVerificationPlan ? { releaseVerificationPlan } : {}),
        catalogRevision: parseRevision(input.catalogRevision, "admission.catalogRevision"),
        compatibilityRevision: parseCompatibilityRevision(input.compatibilityRevision),
    };
}

export async function identifyAdmissionInputSnapshot(value: unknown): Promise<IdentifiedAdmissionInputSnapshotV1> {
    const snapshot = validateAdmissionInputSnapshot(value);
    if (snapshot.behavioralRlsPlan) {
        const identifiedPlan = await identifyBehavioralRlsPlan(snapshot.behavioralRlsPlan.plan);
        if (identifiedPlan.digest !== snapshot.behavioralRlsPlan.digest) {
            invalidReference("admission.behavioralRlsPlan.digest", "does not identify the canonical plan");
        }
    }
    if (snapshot.releaseVerificationPlan) {
        const identifiedPlan = await identifyReleaseVerificationPlan(snapshot.releaseVerificationPlan.plan);
        if (identifiedPlan.digest !== snapshot.releaseVerificationPlan.digest) {
            invalidReference("admission.releaseVerificationPlan.digest", "does not identify the canonical plan");
        }
    }
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
    assertBehavioralRlsPlanPolicy(admission.snapshot);
    return admission;
}

function parseBehavioralRlsPlanBinding(value: unknown): NonNullable<AdmissionInputSnapshotV1["behavioralRlsPlan"]> {
    const input = strictRecord(value, "admission.behavioralRlsPlan", ["digest", "plan"]);
    return {
        digest: sha256Digest(input.digest, "admission.behavioralRlsPlan.digest"),
        plan: validateBehavioralRlsPlan(input.plan),
    };
}

function parseReleaseVerificationPlanBinding(
    value: unknown,
): NonNullable<AdmissionInputSnapshotV1["releaseVerificationPlan"]> {
    const input = strictRecord(value, "admission.releaseVerificationPlan", ["digest", "plan"]);
    return {
        digest: sha256Digest(input.digest, "admission.releaseVerificationPlan.digest"),
        plan: validateReleaseVerificationPlan(input.plan),
    };
}

function assertReleaseVerificationPlanReferences(
    plan: NonNullable<AdmissionInputSnapshotV1["releaseVerificationPlan"]>["plan"],
    candidate: AdmissionInputSnapshotV1["candidate"],
): void {
    if (
        plan.baselines.some((baseline) => integrationVersionReleaseLevel(baseline.version, candidate.version) === null)
    ) {
        invalidReference(
            "admission.releaseVerificationPlan.plan.baselines",
            "must contain only immutable versions older than the candidate",
        );
    }
}

function assertBehavioralRlsPlanReferences(
    plan: NonNullable<AdmissionInputSnapshotV1["behavioralRlsPlan"]>["plan"],
    candidate: AdmissionInputSnapshotV1["candidate"],
    policyDigest: string,
): void {
    if (
        plan.target.kind !== candidate.kind ||
        plan.target.version !== candidate.version ||
        plan.target.candidateDigest !== candidate.candidateDigest ||
        plan.target.packageDigest !== candidate.packageDigest ||
        plan.target.verificationDigest !== candidate.verificationDigest ||
        plan.policyDigest !== policyDigest
    ) {
        invalidReference("admission.behavioralRlsPlan", "does not bind the exact candidate and policy");
    }
}

function assertBehavioralRlsPlanPolicy(admission: AdmissionInputSnapshotV1): void {
    const suite = admission.suites.find(
        (entry) => entry.source === "platform" && entry.suiteId === BEHAVIORAL_RLS_PLATFORM_SUITE_ID,
    );
    if (Boolean(suite) !== Boolean(admission.behavioralRlsPlan)) {
        invalidReference(
            "admission.behavioralRlsPlan",
            `must be present exactly when ${BEHAVIORAL_RLS_PLATFORM_SUITE_ID} is planned`,
        );
    }
    if (suite?.applicable === false && admission.behavioralRlsPlan!.plan.probes.length !== 0) {
        invalidReference("admission.behavioralRlsPlan.plan.probes", "must be empty for a non-applicable suite");
    }
}
