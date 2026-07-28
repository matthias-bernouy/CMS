import { identifyCompatibilityReportV2, type CompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import {
    assertEqual,
    canonicalText,
    digest,
    exactObject,
    nonNegativeInteger,
    RepositoryManagementContractError,
    type JsonObject,
} from "./helpers";

export type CompatibilityReportIdentity = Readonly<{
    kind: string;
    version: string;
    packageDigest?: string;
}>;

export type ValidatedCompatibilityReport = Readonly<{
    report: CompatibilityReportV2;
    reportDigest: string;
    projected: JsonObject;
}>;

export async function validateCompatibilityReport(
    value: unknown,
    expected: CompatibilityReportIdentity,
    revisionType?: "root" | "revision",
): Promise<ValidatedCompatibilityReport> {
    const identified = await identifyCompatibilityReportV2(value);
    const report = identified.report;
    assertEqual(report.kind, expected.kind);
    assertEqual(report.version, expected.version);
    if (expected.packageDigest !== undefined) {
        assertEqual(report.packageDigest, expected.packageDigest);
    }
    if (revisionType !== undefined) {
        assertEqual(report.revisionType, revisionType);
    }
    return { report, reportDigest: identified.digest, projected: projectReport(report) };
}

export async function validateCompatibilityPage(
    value: unknown,
    expected: Readonly<CompatibilityReportIdentity & { after?: string }>,
): Promise<JsonObject> {
    const page = exactObject(
        value,
        ["root", "current", "currentRevisionId", "currentReportDigest", "revisions", "totalRevisions"],
        ["nextCursor"],
    );
    const root = await validateCompatibilityReport(page.root, expected, "root");
    const identity = { ...expected, packageDigest: root.report.packageDigest };
    const [current, revisions] = await Promise.all([
        validateCompatibilityReport(page.current, identity),
        Promise.all(
            reportArray(page.revisions).map(
                async (entry) => await validateCompatibilityReport(entry, identity, "revision"),
            ),
        ),
    ]);
    const currentRevisionId = canonicalText(page.currentRevisionId, 512);
    const currentReportDigest = digest(page.currentReportDigest);
    assertEqual(currentRevisionId, current.report.reportId);
    assertEqual(currentReportDigest, current.reportDigest);
    const totalRevisions = nonNegativeInteger(page.totalRevisions);
    const nextCursor = page.nextCursor === undefined ? undefined : canonicalText(page.nextCursor, 512);
    assertPageChain(root, current, revisions, totalRevisions, expected.after, nextCursor);
    return {
        root: root.projected,
        current: current.projected,
        currentRevisionId,
        currentReportDigest,
        revisions: revisions.map(({ projected }) => projected),
        totalRevisions,
        ...(nextCursor ? { nextCursor } : {}),
    };
}

function assertPageChain(
    root: ValidatedCompatibilityReport,
    current: ValidatedCompatibilityReport,
    revisions: readonly ValidatedCompatibilityReport[],
    totalRevisions: number,
    after: string | undefined,
    nextCursor: string | undefined,
): void {
    const rootId = root.report.reportId;
    const currentId = current.report.reportId;
    let previous = after ?? rootId;
    const seen = new Set([rootId, ...(after ? [after] : [])]);
    for (const { report } of revisions) {
        if (report.revisionType !== "revision" || report.supersedes !== previous || seen.has(report.reportId)) {
            throwContractError();
        }
        seen.add(report.reportId);
        previous = report.reportId;
    }
    const last = revisions.at(-1);
    if (totalRevisions === 0) {
        if (
            after ||
            nextCursor ||
            revisions.length > 0 ||
            current.report.revisionType !== "root" ||
            currentId !== rootId ||
            current.reportDigest !== root.reportDigest
        ) {
            throwContractError();
        }
        return;
    }
    if (current.report.revisionType !== "revision" || currentId === rootId || totalRevisions < revisions.length) {
        throwContractError();
    }
    if (nextCursor) {
        if (!last || nextCursor !== last.report.reportId || totalRevisions <= revisions.length || seen.has(currentId)) {
            throwContractError();
        }
        return;
    }
    if (
        (!after && totalRevisions !== revisions.length) ||
        (last && (currentId !== last.report.reportId || current.reportDigest !== last.reportDigest))
    ) {
        throwContractError();
    }
    if (after && !last && currentId !== after) {
        throwContractError();
    }
}

function projectReport(report: CompatibilityReportV2): JsonObject {
    const projected = {
        reportId: report.reportId,
        revisionType: report.revisionType,
        origin: report.origin,
        kind: report.kind,
        version: report.version,
        packageDigest: report.packageDigest,
        outcome: report.outcome,
        contractAdmissible: report.contractAdmissible,
        evaluator: report.evaluator,
        createdAt: report.createdAt,
        releaseLevel: report.releaseLevel,
        requiredReleaseLevel: report.requiredReleaseLevel,
        baselines: report.baselines,
        informationalBaselines: report.informationalBaselines,
        findings: report.findings.map(({ findingId, classification, surface, code, message }) => ({
            findingId,
            classification,
            surface,
            code,
            message,
        })),
        ...(report.noBaselineReason ? { noBaselineReason: report.noBaselineReason } : {}),
        provenance: {
            reason: report.provenance.reason,
            ...(report.provenance.evidenceIds ? { evidenceIds: report.provenance.evidenceIds } : {}),
        },
    };
    return report.revisionType === "root" ? projected : { ...projected, supersedes: report.supersedes };
}

function reportArray(value: unknown): readonly unknown[] {
    if (!Array.isArray(value) || value.length > 4_096) {
        throwContractError();
    }
    return value;
}

function throwContractError(): never {
    throw new RepositoryManagementContractError();
}
