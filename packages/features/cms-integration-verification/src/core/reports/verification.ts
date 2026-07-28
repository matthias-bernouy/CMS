import type { VerificationReport } from "../../interfaces/reports/verification";
import { VERIFICATION_REPORT_SCHEMA } from "../../interfaces/reports/verification";
import { pinnedRunner, parseVerificationPolicyIdentity } from "../runner";
import { IntegrationVerificationContractError } from "../validation/errors";
import { assertContractIJson, assertUnique, boundedArray, strictRecord } from "../validation/structure";
import { exactVersion, oneOf, packageKind, requiredText, sha256Digest, stableIdentifier } from "../validation/values";
import {
    parseDigestContractReference,
    parseReportHistoryFields,
    parseReportProvenance,
    parseReviewedBaselineReferences,
} from "./shared";
import { compareDependency, parseDependency } from "../verification/admission/fields";
import {
    assertActiveContractsExecuted,
    assertVerificationOutcome,
    parseVerificationResults,
} from "./verificationResult";
import { identifyCanonicalVerificationContract } from "../verification/shared";

const FIELDS = [
    "schema",
    "reportId",
    "revisionType",
    "origin",
    "createdAt",
    "supersedes",
    "kind",
    "version",
    "packageDigest",
    "verificationDigest",
    "runner",
    "policy",
    "policySnapshotDigest",
    "admissionInputDigest",
    "verificationJobResultDigest",
    "dependencies",
    "baselines",
    "activeContracts",
    "environment",
    "results",
    "outcome",
    "provenance",
] as const;

export function parseVerificationReport(value: unknown): VerificationReport {
    assertContractIJson(value);
    const input = strictRecord(value, "verificationReport", FIELDS);
    if (input.schema !== VERIFICATION_REPORT_SCHEMA) {
        throw new IntegrationVerificationContractError(
            "invalid_schema",
            `verificationReport.schema must be ${VERIFICATION_REPORT_SCHEMA}`,
            "verificationReport.schema",
        );
    }
    const activeContracts = boundedArray(
        input.activeContracts,
        "verificationReport.activeContracts",
        parseDigestContractReference,
    );
    assertUnique(
        activeContracts.map((entry) => entry.contractId),
        "verificationReport.activeContracts.contractId",
    );
    const report: VerificationReport = {
        schema: VERIFICATION_REPORT_SCHEMA,
        ...parseReportHistoryFields(input, "verificationReport"),
        kind: packageKind(input.kind, "verificationReport.kind"),
        version: exactVersion(input.version, "verificationReport.version"),
        packageDigest: sha256Digest(input.packageDigest, "verificationReport.packageDigest"),
        verificationDigest: sha256Digest(input.verificationDigest, "verificationReport.verificationDigest"),
        runner: pinnedRunner(input.runner, "verificationReport.runner"),
        policy: parseVerificationPolicyIdentity(input.policy, "verificationReport.policy"),
        policySnapshotDigest: sha256Digest(input.policySnapshotDigest, "verificationReport.policySnapshotDigest"),
        admissionInputDigest: sha256Digest(input.admissionInputDigest, "verificationReport.admissionInputDigest"),
        verificationJobResultDigest: sha256Digest(
            input.verificationJobResultDigest,
            "verificationReport.verificationJobResultDigest",
        ),
        dependencies: parseVerificationDependencies(input.dependencies),
        baselines: parseReviewedBaselineReferences(input.baselines, "verificationReport.baselines"),
        activeContracts,
        environment: parseEnvironment(input.environment),
        results: parseVerificationResults(input.results),
        outcome: oneOf(input.outcome, "verificationReport.outcome", [
            "passed",
            "failed",
            "infrastructure-failure",
        ] as const),
        provenance: parseReportProvenance(input.provenance, "verificationReport.provenance"),
    };
    assertVerificationOutcome(report);
    assertActiveContractsExecuted(report);
    return report;
}

function parseVerificationDependencies(value: unknown): VerificationReport["dependencies"] {
    const dependencies = boundedArray(value, "verificationReport.dependencies", parseDependency).toSorted(
        compareDependency,
    );
    assertUnique(
        dependencies.map(
            (entry) => `${entry.selection ?? "legacy"}\0${entry.kind}\0${entry.version}\0${entry.packageDigest}`,
        ),
        "verificationReport.dependencies identity",
    );
    return dependencies;
}

export async function identifyVerificationReport(
    value: unknown,
): Promise<Readonly<{ report: VerificationReport; canonicalBytes: Uint8Array; digest: string }>> {
    const report = parseVerificationReport(value);
    const identified = await identifyCanonicalVerificationContract(report);
    return { report, canonicalBytes: identified.canonicalBytes, digest: identified.digest };
}

function parseEnvironment(value: unknown): VerificationReport["environment"] {
    const input = strictRecord(value, "verificationReport.environment", ["digest", "versions"]);
    const versionInput = input.versions;
    if (!versionInput || typeof versionInput !== "object" || Array.isArray(versionInput)) {
        throw invalid("verificationReport.environment.versions", "must be an object");
    }
    const entries = Object.entries(versionInput as Record<string, unknown>);
    if (entries.length === 0 || entries.length > 64) {
        throw invalid("verificationReport.environment.versions", "must contain between 1 and 64 versions");
    }
    const versions = Object.fromEntries(
        entries.map(([name, version]) => [
            stableIdentifier(name, "verificationReport.environment.versions key"),
            requiredText(version, `verificationReport.environment.versions.${name}`, 128),
        ]),
    );
    return {
        digest: sha256Digest(input.digest, "verificationReport.environment.digest"),
        versions,
    };
}

function invalid(field: string, message: string): IntegrationVerificationContractError {
    return new IntegrationVerificationContractError("invalid_contract", `${field} ${message}`, field);
}
