import { identifyCompatibilityReportV2, type CompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import { IntegrationRepositoryContractError } from "@bernouy/cms-integrations";
import type {
    PublicRepositoryCompatibilityPage,
    PublicRepositoryCompatibilityReport,
    RepositoryCompatibilityPageRequest,
    RepositoryCompatibilityPageSource,
} from "./contracts";
import {
    assertPublicResponseSize,
    invalidSource,
    PUBLIC_COMPATIBILITY_LIMITS,
    sourceArray,
    sourceIdentifier,
    sourceRecord,
    sourceText,
} from "./limits";

export async function projectPublicCompatibilityPage(
    value: RepositoryCompatibilityPageSource,
    identity: Readonly<{ kind: string; version: string }>,
    page: RepositoryCompatibilityPageRequest,
): Promise<PublicRepositoryCompatibilityPage> {
    try {
        return await projectValidatedCompatibilityPage(value, identity, page);
    } catch (error) {
        if (error instanceof IntegrationRepositoryContractError) {
            throw error;
        }
        throw invalidSource();
    }
}

async function projectValidatedCompatibilityPage(
    value: RepositoryCompatibilityPageSource,
    identity: Readonly<{ kind: string; version: string }>,
    page: RepositoryCompatibilityPageRequest,
): Promise<PublicRepositoryCompatibilityPage> {
    const source = sourceRecord(value);
    const root = (await identifyCompatibilityReportV2(source.root)).report;
    const currentIdentity = await identifyCompatibilityReportV2(source.current);
    const revisions = await Promise.all(
        sourceArray(source.revisions, page.limit ?? PUBLIC_COMPATIBILITY_LIMITS.defaultPageSize).map(
            async (revision) => (await identifyCompatibilityReportV2(revision)).report,
        ),
    );
    const currentRevisionId = sourceIdentifier(source.currentRevisionId);
    const currentReportDigest = digest(source.currentReportDigest);
    const totalRevisions = boundedRevisionCount(source.totalRevisions, revisions.length);
    const nextCursor = source.nextCursor === undefined ? undefined : sourceIdentifier(source.nextCursor);

    assertIdentity(identity, [root, currentIdentity.report, ...revisions]);
    if (
        root.revisionType !== "root" ||
        currentRevisionId !== currentIdentity.report.reportId ||
        currentReportDigest !== currentIdentity.digest
    ) {
        throw invalidSource();
    }
    assertRevisionPage(root.reportId, currentRevisionId, revisions, totalRevisions, nextCursor, page.after);

    const projected = {
        root: projectReport(root) as PublicRepositoryCompatibilityPage["root"],
        current: projectReport(currentIdentity.report),
        revisions: revisions.map(
            (revision) => projectReport(revision) as PublicRepositoryCompatibilityPage["revisions"][number],
        ),
        totalRevisions,
        ...(nextCursor ? { nextCursor } : {}),
    };
    assertPublicResponseSize(projected);
    return projected;
}

function projectReport(report: CompatibilityReportV2): PublicRepositoryCompatibilityReport {
    if (
        report.baselines.length > PUBLIC_COMPATIBILITY_LIMITS.baselines ||
        report.informationalBaselines.length > PUBLIC_COMPATIBILITY_LIMITS.baselines ||
        report.findings.length > PUBLIC_COMPATIBILITY_LIMITS.evidencePerReport
    ) {
        throw invalidSource();
    }
    const evidenceIds = sourceArray(report.provenance.evidenceIds ?? [], PUBLIC_COMPATIBILITY_LIMITS.evidenceIds).map(
        sourceIdentifier,
    );
    const base = {
        reportId: sourceIdentifier(report.reportId),
        origin: report.origin,
        createdAt: sourceText(report.createdAt, PUBLIC_COMPATIBILITY_LIMITS.shortTextBytes),
        kind: report.kind,
        version: report.version,
        packageDigest: report.packageDigest,
        evaluator: {
            name: sourceText(report.evaluator.name, PUBLIC_COMPATIBILITY_LIMITS.shortTextBytes),
            version: sourceText(report.evaluator.version, PUBLIC_COMPATIBILITY_LIMITS.shortTextBytes),
        },
        baselines: report.baselines,
        informationalBaselines: report.informationalBaselines,
        findings: report.findings.map((finding) => ({
            findingId: sourceIdentifier(finding.findingId),
            classification: finding.classification,
            surface: finding.surface,
            code: sourceText(finding.code, PUBLIC_COMPATIBILITY_LIMITS.shortTextBytes),
            message: sourceText(finding.message, PUBLIC_COMPATIBILITY_LIMITS.messageBytes),
        })),
        outcome: report.outcome,
        requiredReleaseLevel: report.requiredReleaseLevel,
        releaseLevel: report.releaseLevel,
        contractAdmissible: report.contractAdmissible,
        ...(report.noBaselineReason ? { noBaselineReason: report.noBaselineReason } : {}),
        provenance: {
            reason: sourceText(report.provenance.reason, PUBLIC_COMPATIBILITY_LIMITS.messageBytes),
            ...(evidenceIds.length > 0 ? { evidenceIds } : {}),
        },
    };
    return report.revisionType === "root"
        ? { ...base, revisionType: "root" }
        : { ...base, revisionType: "revision", supersedes: sourceIdentifier(report.supersedes) };
}

function assertIdentity(
    expected: Readonly<{ kind: string; version: string }>,
    reports: readonly CompatibilityReportV2[],
): void {
    const root = reports[0];
    if (!root) {
        throw invalidSource();
    }
    for (const report of reports) {
        if (
            report.kind !== expected.kind ||
            report.version !== expected.version ||
            report.packageDigest !== root.packageDigest
        ) {
            throw invalidSource();
        }
    }
}

function assertRevisionPage(
    rootId: string,
    currentId: string,
    revisions: readonly CompatibilityReportV2[],
    totalRevisions: number,
    nextCursor: string | undefined,
    after: string | undefined,
): void {
    let previous = after ?? rootId;
    for (const revision of revisions) {
        if (revision.revisionType !== "revision" || revision.supersedes !== previous) {
            throw invalidSource();
        }
        previous = revision.reportId;
    }
    const last = revisions.at(-1);
    if (nextCursor && (!last || nextCursor !== last.reportId || totalRevisions <= revisions.length)) {
        throw invalidSource();
    }
    if (!after && !nextCursor && revisions.length !== totalRevisions) {
        throw invalidSource();
    }
    if (!nextCursor && last && currentId !== last.reportId) {
        throw invalidSource();
    }
    if (!nextCursor && after && !last && currentId !== after) {
        throw invalidSource();
    }
}

function boundedRevisionCount(value: unknown, pageLength: number): number {
    if (
        !Number.isSafeInteger(value) ||
        (value as number) < 0 ||
        (value as number) > PUBLIC_COMPATIBILITY_LIMITS.totalRevisions ||
        (value as number) < pageLength
    ) {
        throw invalidSource();
    }
    return value as number;
}

function digest(value: unknown): string {
    if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
        throw invalidSource();
    }
    return value;
}
