import {
    array,
    assertEqual,
    boolean,
    canonicalText,
    digest,
    enumValue,
    exactObject,
    isoTimestamp,
    nonNegativeInteger,
    packageKind,
    packageVersion,
    RepositoryManagementContractError,
    type JsonObject,
} from "./helpers";

const OUTCOMES = ["compatible", "breaking", "unknown", "invalid", "not-applicable"] as const;
const EVIDENCE_CLASSIFICATIONS = ["compatible", "additive", "breaking", "unknown", "invalid"] as const;
const EVIDENCE_SURFACES = ["definition", "input", "dependency", "artifact", "schema", "function"] as const;
const REQUIRED_RELEASE_LEVELS = ["major", "minor", "patch", "none"] as const;
const RELEASE_LEVELS = ["initial", "major", "minor", "patch"] as const;
const NO_BASELINE_REASONS = ["new-kind", "new-major"] as const;

export type CompatibilityReportIdentity = Readonly<{
    kind: string;
    version: string;
    packageDigest?: string;
}>;

export function validateAdmissionReport(value: unknown, expected: CompatibilityReportIdentity): JsonObject {
    return validateReport(value, expected, "admission");
}

export function validateRevisionReport(value: unknown, expected: CompatibilityReportIdentity): JsonObject {
    return validateReport(value, expected, "revision");
}

export function validateCompatibilityPage(
    value: unknown,
    expected: Readonly<CompatibilityReportIdentity & { after?: string }>,
): JsonObject {
    const page = exactObject(value, ["admission", "current", "revisions", "totalRevisions"], ["nextCursor"]);
    const admission = validateAdmissionReport(page.admission, expected);
    const identity = {
        kind: expected.kind,
        version: expected.version,
        packageDigest: digest(admission.packageDigest),
    };
    if (!page.current || typeof page.current !== "object" || Array.isArray(page.current)) {
        throwContractError();
    }
    const currentType = (page.current as JsonObject).reportType;
    const current =
        currentType === "admission"
            ? validateAdmissionReport(page.current, identity)
            : validateRevisionReport(page.current, identity);
    const revisions = array(page.revisions).map((entry) => validateRevisionReport(entry, identity));
    const totalRevisions = nonNegativeInteger(page.totalRevisions);
    if (totalRevisions < revisions.length) {
        throwContractError();
    }
    assertRevisionPageChain(revisions, expected.after ?? canonicalText(admission.id, 512));
    const nextCursor = page.nextCursor === undefined ? undefined : canonicalText(page.nextCursor, 512);
    if (nextCursor !== undefined && (revisions.length === 0 || nextCursor !== revisions.at(-1)?.id)) {
        throwContractError();
    }
    if (nextCursor === undefined) {
        const terminalId = revisions.at(-1)?.id ?? expected.after ?? admission.id;
        assertEqual(current.id, terminalId);
        if (expected.after === undefined && totalRevisions !== revisions.length) {
            throwContractError();
        }
    }
    if (current.reportType === "admission" && totalRevisions !== 0) {
        throwContractError();
    }
    return page;
}

function validateReport(
    value: unknown,
    expected: CompatibilityReportIdentity,
    reportType: "admission" | "revision",
): JsonObject {
    const required = [
        "reportType",
        "id",
        "kind",
        "version",
        "packageDigest",
        "evaluator",
        "createdAt",
        "baselines",
        "informationalBaselines",
        "evidence",
        "outcome",
        "requiredReleaseLevel",
        "releaseLevel",
        "admissible",
        ...(reportType === "revision" ? ["supersedes", "provenance"] : []),
    ];
    const report = exactObject(value, required, ["noBaselineReason"]);
    assertEqual(report.reportType, reportType);
    canonicalText(report.id, 512);
    assertEqual(packageKind(report.kind), expected.kind);
    assertEqual(packageVersion(report.version), expected.version);
    const packageDigest = digest(report.packageDigest);
    if (expected.packageDigest !== undefined) {
        assertEqual(packageDigest, expected.packageDigest);
    }
    validateEvaluator(report.evaluator);
    isoTimestamp(report.createdAt);
    const baselines = array(report.baselines, 1).map(validateBaseline);
    const informationalBaselines = array(report.informationalBaselines, 1).map(validateBaseline);
    array(report.evidence).forEach(validateEvidence);
    enumValue(report.outcome, OUTCOMES);
    enumValue(report.requiredReleaseLevel, REQUIRED_RELEASE_LEVELS);
    enumValue(report.releaseLevel, RELEASE_LEVELS);
    boolean(report.admissible);
    const noBaselineReason =
        report.noBaselineReason === undefined ? undefined : enumValue(report.noBaselineReason, NO_BASELINE_REASONS);
    validateBaselineShape(baselines.length, informationalBaselines.length, noBaselineReason);
    if (reportType === "revision") {
        const supersedes = canonicalText(report.supersedes, 512);
        if (supersedes === report.id) {
            throwContractError();
        }
        validateProvenance(report.provenance);
    }
    return report;
}

function validateBaseline(value: unknown): JsonObject {
    const baseline = exactObject(value, ["kind", "version", "packageDigest"]);
    packageKind(baseline.kind);
    packageVersion(baseline.version);
    digest(baseline.packageDigest);
    return baseline;
}

function validateEvaluator(value: unknown): void {
    const evaluator = exactObject(value, ["name", "version"]);
    canonicalText(evaluator.name, 512);
    canonicalText(evaluator.version, 128);
}

function validateEvidence(value: unknown): void {
    const evidence = exactObject(value, ["classification", "surface", "code", "path", "message"]);
    enumValue(evidence.classification, EVIDENCE_CLASSIFICATIONS);
    enumValue(evidence.surface, EVIDENCE_SURFACES);
    canonicalText(evidence.code, 512);
    canonicalText(evidence.path, 4_096);
    canonicalText(evidence.message, 16_384);
}

function validateProvenance(value: unknown): void {
    const provenance = exactObject(value, ["actor", "reason"], ["evidenceIds"]);
    canonicalText(provenance.actor, 512);
    canonicalText(provenance.reason, 4_096);
    if (provenance.evidenceIds !== undefined) {
        const evidenceIds = array(provenance.evidenceIds, 128).map((entry) => canonicalText(entry, 512));
        if (new Set(evidenceIds).size !== evidenceIds.length) {
            throwContractError();
        }
    }
}

function validateBaselineShape(enforcing: number, informational: number, reason: string | undefined): void {
    const compared = enforcing === 1 && informational === 0 && reason === undefined;
    const newKind = enforcing === 0 && informational === 0 && reason === "new-kind";
    const newMajor = enforcing === 0 && informational <= 1 && reason === "new-major";
    if (!compared && !newKind && !newMajor) {
        throwContractError();
    }
}

function assertRevisionPageChain(revisions: readonly JsonObject[], initialId: string): void {
    let previousId = initialId;
    const ids = new Set<string>();
    for (const revision of revisions) {
        assertEqual(revision.supersedes, previousId);
        const id = canonicalText(revision.id, 512);
        if (ids.has(id)) {
            throwContractError();
        }
        ids.add(id);
        previousId = id;
    }
}

function throwContractError(): never {
    throw new RepositoryManagementContractError();
}
