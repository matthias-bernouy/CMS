import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type { FindingResolutionPolicyRule } from "../../../interfaces/finding";
import type {
    PlatformRequiredVerificationSuiteV1,
    ReleaseAdmissionPolicySnapshotV1,
} from "../../../interfaces/verification";
import { pinnedRunner } from "../../runner";
import { assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import { oneOf, sha256Digest, stableIdentifier } from "../../validation/values";
import { compareText, invalidReference } from "../shared";

const FINDING_SURFACES = ["definition", "input", "dependency", "artifact", "schema", "function"] as const;

export function parsePlatformSuite(value: unknown, field: string): PlatformRequiredVerificationSuiteV1 {
    const input = strictRecord(value, field, ["suiteId", "suiteDigest", "runner"]);
    return {
        suiteId: stableIdentifier(input.suiteId, `${field}.suiteId`),
        suiteDigest: sha256Digest(input.suiteDigest, `${field}.suiteDigest`),
        runner: pinnedRunner(input.runner, `${field}.runner`),
    };
}

export function parseFindingRule(value: unknown, field: string): FindingResolutionPolicyRule {
    const input = strictRecord(value, field, ["surface", "code", "proofTypes", "producers", "runnerDigests"]);
    const runnerDigests =
        input.runnerDigests === undefined
            ? undefined
            : boundedArray(input.runnerDigests, `${field}.runnerDigests`, sha256Digest, { minimum: 1 }).toSorted(
                  compareText,
              );
    if (runnerDigests) {
        assertUnique(runnerDigests, `${field}.runnerDigests`);
    }
    return {
        surface: oneOf(input.surface, `${field}.surface`, FINDING_SURFACES),
        code: stableIdentifier(input.code, `${field}.code`),
        proofTypes: sortedIdentifiers(input.proofTypes, `${field}.proofTypes`),
        producers: sortedIdentifiers(input.producers, `${field}.producers`),
        ...(runnerDigests ? { runnerDigests } : {}),
    };
}

export async function assertFindingRunnersApproved(
    rules: readonly FindingResolutionPolicyRule[],
    approvedRunners: ReleaseAdmissionPolicySnapshotV1["approvedRunners"],
): Promise<void> {
    const approved = new Set(await Promise.all(approvedRunners.map((runner) => sha256Hex(canonicalJsonBytes(runner)))));
    if (rules.flatMap((rule) => rule.runnerDigests ?? []).some((digest) => !approved.has(digest))) {
        invalidReference("policy.findingResolutionRules.runnerDigests", "must reference an approved runner identity");
    }
}

export function compareRunner(
    left: ReleaseAdmissionPolicySnapshotV1["approvedRunners"][number],
    right: ReleaseAdmissionPolicySnapshotV1["approvedRunners"][number],
): number {
    return compareText(
        `${left.name}\0${left.version}\0${left.imageDigest}`,
        `${right.name}\0${right.version}\0${right.imageDigest}`,
    );
}

export function compareFindingRule(left: FindingResolutionPolicyRule, right: FindingResolutionPolicyRule): number {
    return compareText(`${left.surface}\0${left.code}`, `${right.surface}\0${right.code}`);
}

function sortedIdentifiers(value: unknown, field: string): string[] {
    const result = boundedArray(value, field, stableIdentifier, { minimum: 1 }).toSorted(compareText);
    assertUnique(result, field);
    return result;
}
