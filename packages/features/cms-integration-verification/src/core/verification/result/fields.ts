import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type { VerificationJobResultV1 } from "../../../interfaces/verification";
import { IntegrationVerificationContractError } from "../../validation/errors";
import { assertUnique, boundedArray, strictRecord } from "../../validation/structure";
import { requiredText, sha256Digest, stableIdentifier } from "../../validation/values";
import { compareText } from "../shared";

export function parseBindings(value: unknown): VerificationJobResultV1["bindings"] {
    const field = "jobResult.bindings";
    const hasBehavioralRlsPlanDigest = Boolean(
        value && typeof value === "object" && !Array.isArray(value) && Object.hasOwn(value, "behavioralRlsPlanDigest"),
    );
    const input = strictRecord(value, field, [
        "admissionDigest",
        "candidateDigest",
        "packageDigest",
        "verificationDigest",
        "policyDigest",
        "reviewedBaselineRevisionIds",
        "reviewedBaselineDigests",
        "reviewedObservedSchemaDigests",
        "dependencyDigests",
        "activeContractDigests",
        "suiteContentDigests",
        "catalogRevisionDigest",
        "compatibilityRevisionDigest",
        "compatibilityEvaluatorInputDigest",
        ...(hasBehavioralRlsPlanDigest ? ["behavioralRlsPlanDigest"] : []),
    ]);
    return {
        admissionDigest: sha256Digest(input.admissionDigest, `${field}.admissionDigest`),
        candidateDigest: sha256Digest(input.candidateDigest, `${field}.candidateDigest`),
        packageDigest: sha256Digest(input.packageDigest, `${field}.packageDigest`),
        verificationDigest: sha256Digest(input.verificationDigest, `${field}.verificationDigest`),
        policyDigest: sha256Digest(input.policyDigest, `${field}.policyDigest`),
        reviewedBaselineRevisionIds: sortedIdentifiers(
            input.reviewedBaselineRevisionIds,
            `${field}.reviewedBaselineRevisionIds`,
        ),
        reviewedBaselineDigests: sortedDigests(
            input.reviewedBaselineDigests,
            `${field}.reviewedBaselineDigests`,
            false,
        ),
        reviewedObservedSchemaDigests: sortedDigests(
            input.reviewedObservedSchemaDigests,
            `${field}.reviewedObservedSchemaDigests`,
            false,
        ),
        dependencyDigests: sortedDigests(input.dependencyDigests, `${field}.dependencyDigests`),
        activeContractDigests: sortedDigests(input.activeContractDigests, `${field}.activeContractDigests`, false),
        suiteContentDigests: sortedDigests(input.suiteContentDigests, `${field}.suiteContentDigests`, false),
        catalogRevisionDigest: sha256Digest(input.catalogRevisionDigest, `${field}.catalogRevisionDigest`),
        compatibilityRevisionDigest: sha256Digest(
            input.compatibilityRevisionDigest,
            `${field}.compatibilityRevisionDigest`,
        ),
        compatibilityEvaluatorInputDigest: sha256Digest(
            input.compatibilityEvaluatorInputDigest,
            `${field}.compatibilityEvaluatorInputDigest`,
        ),
        ...(hasBehavioralRlsPlanDigest
            ? {
                  behavioralRlsPlanDigest: sha256Digest(
                      input.behavioralRlsPlanDigest,
                      `${field}.behavioralRlsPlanDigest`,
                  ),
              }
            : {}),
    };
}

export async function parseEnvironment(value: unknown): Promise<VerificationJobResultV1["environment"]> {
    const field = "jobResult.environment";
    const input = strictRecord(value, field, ["digest", "versions"]);
    const versions = boundedArray(
        input.versions,
        `${field}.versions`,
        (entry, entryField) => {
            const version = strictRecord(entry, entryField, ["name", "version"]);
            return {
                name: stableIdentifier(version.name, `${entryField}.name`),
                version: requiredText(version.version, `${entryField}.version`, 128),
            };
        },
        { minimum: 1, maximum: 64 },
    ).toSorted((left, right) => compareText(left.name, right.name));
    assertUnique(
        versions.map((entry) => entry.name),
        `${field}.versions.name`,
    );
    const digest = sha256Digest(input.digest, `${field}.digest`);
    if ((await sha256Hex(canonicalJsonBytes(versions))) !== digest) {
        throw new IntegrationVerificationContractError(
            "invalid_digest",
            `${field}.digest does not identify the canonical environment versions`,
            `${field}.digest`,
        );
    }
    return { digest, versions };
}

function sortedDigests(value: unknown, field: string, unique = true): string[] {
    const result = boundedArray(value, field, sha256Digest).toSorted(compareText);
    if (unique) {
        assertUnique(result, field);
    }
    return result;
}

function sortedIdentifiers(value: unknown, field: string): string[] {
    return boundedArray(value, field, stableIdentifier).toSorted(compareText);
}
