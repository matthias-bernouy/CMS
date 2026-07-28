import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import type {
    CompatibilityFinding,
    CompatibilityFindingIdentityInput,
    CompatibilityFindingInput,
    FindingResolutionProof,
} from "../interfaces/finding";
import { FINDING_RESOLUTION_PROOF_SCHEMA } from "../interfaces/finding";
import type { VerificationPolicyIdentity } from "../interfaces/runner";
import { IntegrationVerificationContractError } from "./validation/errors";
import { assertContractIJson, strictRecord } from "./validation/structure";
import {
    assertVersionInRange,
    exactVersion,
    oneOf,
    requiredText,
    sha256Digest,
    stableIdentifier,
    supportedVersionRange,
    timestamp,
} from "./validation/values";

const FINDING_SURFACES = ["definition", "input", "dependency", "artifact", "schema", "function"] as const;
const FINDING_CLASSIFICATIONS = ["compatible", "additive", "breaking", "unknown", "invalid"] as const;

export async function computeCompatibilityFindingId(value: CompatibilityFindingIdentityInput): Promise<string> {
    assertContractIJson(value);
    const identity = parseFindingIdentity(
        strictRecord(value, "finding", ["surface", "path", "code", "baselineDigest", "candidateDigest"]),
        "finding",
    );
    return sha256Hex(canonicalJsonBytes(identity));
}

export async function createCompatibilityFinding(value: CompatibilityFindingInput): Promise<CompatibilityFinding> {
    assertContractIJson(value);
    const input = strictRecord(value, "finding", [
        "surface",
        "path",
        "code",
        "baselineDigest",
        "candidateDigest",
        "classification",
        "message",
    ]);
    const identity = parseFindingIdentity(input, "finding");
    return {
        ...identity,
        classification: oneOf(input.classification, "finding.classification", FINDING_CLASSIFICATIONS),
        message: requiredText(input.message, "finding.message"),
        findingId: await computeCompatibilityFindingId(identity),
    };
}

export async function parseCompatibilityFinding(value: unknown, field = "finding"): Promise<CompatibilityFinding> {
    assertContractIJson(value);
    const input = strictRecord(value, field, [
        "findingId",
        "surface",
        "path",
        "code",
        "baselineDigest",
        "candidateDigest",
        "classification",
        "message",
    ]);
    const identity = parseFindingIdentity(input, field);
    const findingId = sha256Digest(input.findingId, `${field}.findingId`);
    if ((await computeCompatibilityFindingId(identity)) !== findingId) {
        throw new IntegrationVerificationContractError(
            "invalid_digest",
            `${field}.findingId does not match its canonical identity`,
            `${field}.findingId`,
        );
    }
    return {
        findingId,
        ...identity,
        classification: oneOf(input.classification, `${field}.classification`, FINDING_CLASSIFICATIONS),
        message: requiredText(input.message, `${field}.message`),
    };
}

export function parseFindingResolutionProof(value: unknown): FindingResolutionProof {
    assertContractIJson(value);
    const input = strictRecord(value, "proof", [
        "schema",
        "findingId",
        "outcome",
        "proofType",
        "producer",
        "policy",
        "runnerDigest",
        "evidenceDigest",
        "createdAt",
    ]);
    if (input.schema !== FINDING_RESOLUTION_PROOF_SCHEMA) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `proof.schema must be ${FINDING_RESOLUTION_PROOF_SCHEMA}`,
            "proof.schema",
        );
    }
    const policyInput = strictRecord(input.policy, "proof.policy", ["name", "version", "applicableVersionRange"]);
    const policy = {
        name: stableIdentifier(policyInput.name, "proof.policy.name"),
        version: exactVersion(policyInput.version, "proof.policy.version"),
        applicableVersionRange: supportedVersionRange(
            policyInput.applicableVersionRange,
            "proof.policy.applicableVersionRange",
        ),
    };
    assertVersionInRange(policy.version, policy.applicableVersionRange, "proof.policy.applicableVersionRange");
    return {
        schema: FINDING_RESOLUTION_PROOF_SCHEMA,
        findingId: sha256Digest(input.findingId, "proof.findingId"),
        outcome: oneOf(input.outcome, "proof.outcome", [
            "resolved-compatible",
            "confirmed-breaking",
            "invalid",
        ] as const),
        proofType: stableIdentifier(input.proofType, "proof.proofType"),
        producer: stableIdentifier(input.producer, "proof.producer"),
        policy,
        ...(input.runnerDigest === undefined
            ? {}
            : { runnerDigest: sha256Digest(input.runnerDigest, "proof.runnerDigest") }),
        evidenceDigest: sha256Digest(input.evidenceDigest, "proof.evidenceDigest"),
        createdAt: timestamp(input.createdAt, "proof.createdAt"),
    };
}

export function findingResolutionProofAppliesToPolicy(
    proof: FindingResolutionProof,
    policy: VerificationPolicyIdentity,
): boolean {
    return (
        proof.policy.name === policy.name &&
        integrationVersionSatisfies(policy.version, proof.policy.applicableVersionRange)
    );
}

function parseFindingIdentity(value: unknown, field: string): CompatibilityFindingIdentityInput {
    const input = value as Record<string, unknown>;
    return {
        surface: oneOf(input.surface, `${field}.surface`, FINDING_SURFACES),
        path: requiredText(input.path, `${field}.path`, 4_096),
        code: stableIdentifier(input.code, `${field}.code`),
        baselineDigest: sha256Digest(input.baselineDigest, `${field}.baselineDigest`),
        candidateDigest: sha256Digest(input.candidateDigest, `${field}.candidateDigest`),
    };
}
