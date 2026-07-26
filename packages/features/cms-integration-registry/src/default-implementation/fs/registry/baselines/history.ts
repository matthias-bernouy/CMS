import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { assertReportRevisionFollows, identifyReviewedSchemaBaseline } from "@bernouy/cms-integration-verification";
import { ReviewedSchemaBaselineIntegrityError } from "../../../../core/compatibility/reportStoreErrors";
import type {
    ReviewedSchemaBaselineHistory,
    ReviewedSchemaBaselineLogicalKey,
} from "../../../../interfaces/reportStore";
import { withVerifiedRegistryDirectory } from "../persistence/ownedDirectory";
import {
    readReviewedSchemaBaselineIdentity,
    readReviewedSchemaBaselineRevision,
    reviewedSchemaBaselineLogicalKey,
    writeReviewedSchemaBaselineIdentity,
} from "./document";
import { reviewedSchemaBaselineRevisionFilename } from "./layout";

const MAX_BASELINE_REVISIONS = 4_096;
const CANONICAL_TEMPORARY_FILE = /^\.[0-9a-f-]{36}\.tmp$/u;

export async function ensureReviewedSchemaBaselineIdentity(
    path: string,
    logicalKey: ReviewedSchemaBaselineLogicalKey,
): Promise<void> {
    try {
        await writeReviewedSchemaBaselineIdentity(path, logicalKey);
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
    }
    const stored = await readReviewedSchemaBaselineIdentity(path);
    if (!stored || compareReviewedSchemaBaselineKey(stored, logicalKey) !== 0) {
        throw new ReviewedSchemaBaselineIntegrityError("Reviewed schema baseline logical-key digest collision");
    }
}

export async function loadReviewedSchemaBaselineHistory(
    historyRoot: string,
    expectedKey?: ReviewedSchemaBaselineLogicalKey,
    allowEmpty = false,
): Promise<ReviewedSchemaBaselineHistory | null> {
    const identity = await readReviewedSchemaBaselineIdentity(join(historyRoot, "identity.json"));
    if (!identity || (expectedKey && compareReviewedSchemaBaselineKey(identity, expectedKey) !== 0)) {
        throw new ReviewedSchemaBaselineIntegrityError("Reviewed schema baseline identity is missing or inconsistent");
    }
    const documents = await readRevisionDocuments(join(historyRoot, "revisions"));
    if (documents.length === 0) {
        if (allowEmpty) {
            return null;
        }
        throw new ReviewedSchemaBaselineIntegrityError("Reviewed schema baseline history has no root revision");
    }
    validateHistory(identity, documents);
    const revisions = documents.map(({ baseline }) => baseline);
    const current = revisions.at(-1)!;
    return {
        logicalKey: identity,
        currentRevisionId: current.reportId,
        currentBaselineDigest: documents.at(-1)!.baselineDigest,
        current,
        revisions,
    };
}

export function requireReviewedSchemaBaselineHistory(
    history: ReviewedSchemaBaselineHistory | null,
): ReviewedSchemaBaselineHistory {
    if (!history) {
        throw new ReviewedSchemaBaselineIntegrityError("Reviewed schema baseline history unexpectedly disappeared");
    }
    return history;
}

export function compareReviewedSchemaBaselineKey(
    left: ReviewedSchemaBaselineLogicalKey,
    right: ReviewedSchemaBaselineLogicalKey,
): number {
    return (
        compareText(left.kind, right.kind) ||
        compareText(left.version, right.version) ||
        compareText(left.packageDigest, right.packageDigest) ||
        compareText(left.connectorKey, right.connectorKey) ||
        compareText(left.lineageId, right.lineageId)
    );
}

function validateHistory(
    identity: ReviewedSchemaBaselineLogicalKey,
    documents: readonly NonNullable<Awaited<ReturnType<typeof readReviewedSchemaBaselineRevision>>>[],
): void {
    for (let index = 0; index < documents.length; index += 1) {
        const document = documents[index]!;
        if (document.ordinal !== index + 1) {
            throw new ReviewedSchemaBaselineIntegrityError(
                "Reviewed schema baseline revision ordinals are not contiguous",
            );
        }
        if (compareReviewedSchemaBaselineKey(reviewedSchemaBaselineLogicalKey(document.baseline), identity) !== 0) {
            throw new ReviewedSchemaBaselineIntegrityError("Reviewed schema baseline revision changed its logical key");
        }
        if (index === 0 && document.baseline.revisionType !== "root") {
            throw new ReviewedSchemaBaselineIntegrityError("Reviewed schema baseline history must start with a root");
        }
        if (index > 0) {
            try {
                assertReportRevisionFollows(documents[index - 1]!.baseline, document.baseline);
            } catch (error) {
                throw new ReviewedSchemaBaselineIntegrityError(
                    "Reviewed schema baseline revisions are branched, reordered, or change origin",
                    { cause: error },
                );
            }
        }
    }
}

async function readRevisionDocuments(
    revisionsRoot: string,
): Promise<readonly NonNullable<Awaited<ReturnType<typeof readReviewedSchemaBaselineRevision>>>[]> {
    return await withVerifiedRegistryDirectory(revisionsRoot, async (descriptorPath) => {
        const handle = await opendir(descriptorPath);
        const entries: Array<NonNullable<Awaited<ReturnType<typeof readReviewedSchemaBaselineRevision>>>> = [];
        for await (const entry of handle) {
            if (entry.isFile() && CANONICAL_TEMPORARY_FILE.test(entry.name)) {
                continue;
            }
            if (entry.isSymbolicLink() || !entry.isFile() || !/^\d{10}\.json$/u.test(entry.name)) {
                throw new ReviewedSchemaBaselineIntegrityError(
                    `Invalid reviewed schema baseline revision entry: ${entry.name}`,
                );
            }
            const document = await readReviewedSchemaBaselineRevision(join(descriptorPath, entry.name));
            if (!document || reviewedSchemaBaselineRevisionFilename(document.ordinal) !== entry.name) {
                throw new ReviewedSchemaBaselineIntegrityError(
                    `Reviewed schema baseline revision filename does not match its ordinal: ${entry.name}`,
                );
            }
            entries.push(document);
            if (entries.length > MAX_BASELINE_REVISIONS) {
                throw new ReviewedSchemaBaselineIntegrityError(
                    `Reviewed schema baseline history exceeds ${MAX_BASELINE_REVISIONS} revisions`,
                );
            }
        }
        return entries.sort((left, right) => left.ordinal - right.ordinal);
    });
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
