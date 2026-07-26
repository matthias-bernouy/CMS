import type {
    PublicRepositoryCompatibilityPage,
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
} from "./limits";
import { projectAdmission, projectCurrent, projectRevision } from "./reportProjection";

export function projectPublicCompatibilityPage(
    value: RepositoryCompatibilityPageSource,
    identity: Readonly<{ kind: string; version: string }>,
    page: RepositoryCompatibilityPageRequest,
): PublicRepositoryCompatibilityPage {
    const source = sourceRecord(value);
    const admission = projectAdmission(source.admission, identity.kind, identity.version);
    const current = projectCurrent(source.current, identity.kind, identity.version);
    const revisionValues = sourceArray(source.revisions, page.limit ?? PUBLIC_COMPATIBILITY_LIMITS.defaultPageSize);
    const revisions = revisionValues.map((revision) => projectRevision(revision, identity.kind, identity.version));
    const totalRevisions = source.totalRevisions;
    if (
        !Number.isSafeInteger(totalRevisions) ||
        (totalRevisions as number) < 0 ||
        (totalRevisions as number) > PUBLIC_COMPATIBILITY_LIMITS.totalRevisions ||
        (totalRevisions as number) < revisions.length
    ) {
        throw invalidSource();
    }
    assertReportIdentity(admission, current, revisions);
    if (
        ((totalRevisions as number) === 0 && (current.reportType !== "admission" || current.id !== admission.id)) ||
        ((totalRevisions as number) > 0 && current.reportType !== "revision")
    ) {
        throw invalidSource();
    }
    assertRevisionChain(admission.id, revisions, page.after);
    const nextCursor = source.nextCursor === undefined ? undefined : sourceIdentifier(source.nextCursor);
    assertPagination(current.id, revisions, totalRevisions as number, nextCursor, page.after);
    const projected = {
        admission,
        current,
        revisions,
        totalRevisions: totalRevisions as number,
        ...(nextCursor ? { nextCursor } : {}),
    };
    assertPublicResponseSize(projected);
    return projected;
}

function assertReportIdentity(
    admission: PublicRepositoryCompatibilityPage["admission"],
    current: PublicRepositoryCompatibilityPage["current"],
    revisions: PublicRepositoryCompatibilityPage["revisions"],
): void {
    for (const report of [current, ...revisions]) {
        if (
            report.kind !== admission.kind ||
            report.version !== admission.version ||
            report.packageDigest !== admission.packageDigest
        ) {
            throw invalidSource();
        }
    }
}

function assertRevisionChain(
    admissionId: string,
    revisions: PublicRepositoryCompatibilityPage["revisions"],
    after: string | undefined,
): void {
    let previous = after ?? admissionId;
    const ids = new Set([admissionId]);
    for (const revision of revisions) {
        if (ids.has(revision.id) || revision.supersedes !== previous) {
            throw invalidSource();
        }
        ids.add(revision.id);
        previous = revision.id;
    }
}

function assertPagination(
    currentId: string,
    revisions: PublicRepositoryCompatibilityPage["revisions"],
    totalRevisions: number,
    nextCursor: string | undefined,
    after: string | undefined,
): void {
    const last = revisions.at(-1);
    if (nextCursor && (!last || nextCursor !== last.id || totalRevisions <= revisions.length)) {
        throw invalidSource();
    }
    if (!after && !nextCursor && revisions.length !== totalRevisions) {
        throw invalidSource();
    }
    if (!nextCursor && last && currentId !== last.id) {
        throw invalidSource();
    }
    if (!nextCursor && after && !last && currentId !== after) {
        throw invalidSource();
    }
}
