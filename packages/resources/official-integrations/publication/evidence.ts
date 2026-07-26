import { assertIntegrationPackagePath, canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA,
    type OfficialBootstrapAnonymousConstraintGrandfathering,
    type OfficialRepositoryBootstrapPlan,
} from "@bernouy/cms-integration-registry";
import { parseReviewedSchemaBaseline } from "@bernouy/cms-integration-verification";
import { OFFICIAL_INTEGRATIONS_ROOT } from "../index";
import { OFFICIAL_REPOSITORY_BOOTSTRAP_EVIDENCE_PATH, type OfficialRepositoryBootstrapEvidenceV1 } from "./contracts";
import { joinWithin, readBoundedJsonDocument } from "./filesystem";
import { buildOfficialIntegrationPackages } from "./packages";
import {
    buildOfficialVerificationBackfillReports,
    loadOfficialIntegrationVerificationBackfill,
    selectOfficialVerificationBackfillPackages,
} from "./packages/verification";
import { assertOfficialRepositoryBootstrapEvidence } from "./validation";

const MAX_OFFICIAL_BOOTSTRAP_EVIDENCE_BYTES = 16 * 1_024 * 1_024;

export async function buildOfficialRepositoryBootstrapPlan(
    requestedRoot: string = OFFICIAL_INTEGRATIONS_ROOT,
): Promise<OfficialRepositoryBootstrapPlan> {
    const allPackages = await buildOfficialIntegrationPackages(requestedRoot);
    const evidence = await loadOfficialRepositoryBootstrapEvidence(requestedRoot);
    const verificationBundles = await loadOfficialIntegrationVerificationBackfill(requestedRoot);
    const packages = selectOfficialVerificationBackfillPackages(allPackages, verificationBundles.index);
    const verificationReports = await buildOfficialVerificationBackfillReports(requestedRoot, evidence);
    assertOfficialRepositoryBootstrapEvidence(packages, evidence);
    return {
        schema: OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA,
        packages: packages.map((entry) => ({
            package: entry.package,
            anonymousConstraintGrandfathering: evidence.anonymousConstraintGrandfathering.filter(
                ({ packageDigest }) => packageDigest === entry.digest,
            ),
        })),
        reviewedSchemaBaselines: evidence.reviewedSchemaBaselines,
        verificationBackfills: verificationBundles.verifications.map((verification, index) => {
            const reports = verificationReports[index];
            if (
                !reports ||
                reports.compatibility.kind !== verification.kind ||
                reports.compatibility.version !== verification.version ||
                reports.compatibility.packageDigest !== verification.packageDigest
            ) {
                throw new Error("Official verification bundle and report inventories diverged");
            }
            return {
                verification: {
                    envelope: verification.envelope,
                    canonicalBytes: verification.canonicalBytes,
                    digest: verification.verificationDigest,
                },
                compatibilityReport: reports.compatibility,
                verificationReport: reports.verification,
                statefulChanges: reports.statefulChanges,
                decision: reports.decision,
            };
        }),
    };
}

export async function loadOfficialRepositoryBootstrapEvidence(
    requestedRoot: string = OFFICIAL_INTEGRATIONS_ROOT,
): Promise<OfficialRepositoryBootstrapEvidenceV1> {
    const path = joinWithin(requestedRoot, OFFICIAL_REPOSITORY_BOOTSTRAP_EVIDENCE_PATH);
    const document = await readBoundedJsonDocument(path, MAX_OFFICIAL_BOOTSTRAP_EVIDENCE_BYTES);
    if (!equalBytes(document.bytes, canonicalJsonBytes(document.value))) {
        throw new Error("Official repository bootstrap evidence must be canonical JSON");
    }
    if (
        !hasExactKeys(document.value, ["anonymousConstraintGrandfathering", "reviewedSchemaBaselines", "schema"]) ||
        document.value.schema !== "cms.integration.official-bootstrap-evidence.v1" ||
        !Array.isArray(document.value.reviewedSchemaBaselines) ||
        !Array.isArray(document.value.anonymousConstraintGrandfathering)
    ) {
        throw new Error("Official repository bootstrap evidence has an invalid closed schema");
    }
    return {
        schema: "cms.integration.official-bootstrap-evidence.v1",
        reviewedSchemaBaselines: await Promise.all(
            document.value.reviewedSchemaBaselines.map((baseline) => parseReviewedSchemaBaseline(baseline)),
        ),
        anonymousConstraintGrandfathering: document.value.anonymousConstraintGrandfathering.map(
            parseAnonymousConstraintGrandfathering,
        ),
    };
}

function parseAnonymousConstraintGrandfathering(value: unknown): OfficialBootstrapAnonymousConstraintGrandfathering {
    if (
        !hasExactKeys(value, ["findings", "packageDigest", "path"]) ||
        typeof value.packageDigest !== "string" ||
        !/^[a-f0-9]{64}$/u.test(value.packageDigest) ||
        typeof value.path !== "string" ||
        !Array.isArray(value.findings) ||
        value.findings.length === 0
    ) {
        throw new Error("Official anonymous constraint grandfathering is invalid");
    }
    const path = value.path;
    assertIntegrationPackagePath(path);
    return {
        packageDigest: value.packageDigest,
        path,
        findings: value.findings.map((finding) => {
            if (
                !hasExactKeys(finding, ["column", "kind", "line", "path"]) ||
                typeof finding.path !== "string" ||
                finding.path !== path ||
                !Number.isSafeInteger(finding.line) ||
                (finding.line as number) < 1 ||
                !Number.isSafeInteger(finding.column) ||
                (finding.column as number) < 1 ||
                (finding.kind !== "anonymous-check" && finding.kind !== "anonymous-unique")
            ) {
                throw new Error("Official anonymous constraint finding is invalid");
            }
            return {
                path: finding.path,
                line: finding.line as number,
                column: finding.column as number,
                kind: finding.kind,
            };
        }),
    };
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
