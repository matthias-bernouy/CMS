import { identifyReviewedSchemaBaselineImportRequest } from "../../../../../core/baselines/request";
import type { ReviewedSchemaBaselineImportRequest } from "../../../../../interfaces/reportStore";
import {
    readCanonicalJsonFile,
    replaceCanonicalJson,
    writeCanonicalJsonNoReplace,
} from "../../persistence/canonicalFile";

export const REVIEWED_SCHEMA_BASELINE_IMPORT_JOURNAL_SCHEMA =
    "cms.integration.registry.reviewed-schema-baseline-import-journal.v1" as const;
export const MAX_REVIEWED_SCHEMA_BASELINE_IMPORT_DOCUMENT_BYTES = 16 * 1_024 * 1_024;
export const MAX_REVIEWED_SCHEMA_BASELINE_IMPORT_JOURNAL_BYTES =
    MAX_REVIEWED_SCHEMA_BASELINE_IMPORT_DOCUMENT_BYTES + 64 * 1_024;
export const FS_REVIEWED_SCHEMA_BASELINE_IMPORT_PHASES = Object.freeze(["prepared", "baseline-written"] as const);

export type FsReviewedSchemaBaselineImportPhase = (typeof FS_REVIEWED_SCHEMA_BASELINE_IMPORT_PHASES)[number];

export type FsReviewedSchemaBaselineImportJournal = Readonly<{
    schema: typeof REVIEWED_SCHEMA_BASELINE_IMPORT_JOURNAL_SCHEMA;
    operationId: string;
    phase: FsReviewedSchemaBaselineImportPhase;
    createdAt: string;
    policyDigest: string;
    requestDigest: string;
    request: ReviewedSchemaBaselineImportRequest;
}>;

export async function createReviewedSchemaBaselineImportJournal(
    path: string,
    journal: FsReviewedSchemaBaselineImportJournal,
): Promise<void> {
    await writeCanonicalJsonNoReplace(
        path,
        await parseJournal(journal),
        MAX_REVIEWED_SCHEMA_BASELINE_IMPORT_JOURNAL_BYTES,
    );
}

export async function writeReviewedSchemaBaselineImportJournal(
    path: string,
    journal: FsReviewedSchemaBaselineImportJournal,
): Promise<void> {
    await replaceCanonicalJson(path, await parseJournal(journal), MAX_REVIEWED_SCHEMA_BASELINE_IMPORT_JOURNAL_BYTES);
}

export async function readReviewedSchemaBaselineImportJournal(
    path: string,
    expectedOperationId: string,
): Promise<FsReviewedSchemaBaselineImportJournal | null> {
    const value = await readCanonicalJsonFile(path, MAX_REVIEWED_SCHEMA_BASELINE_IMPORT_JOURNAL_BYTES);
    if (value === null) {
        return null;
    }
    const journal = await parseJournal(value);
    if (journal.operationId !== expectedOperationId) {
        throw new Error("Reviewed schema baseline import journal operation ID does not match its filename");
    }
    return journal;
}

async function parseJournal(value: unknown): Promise<FsReviewedSchemaBaselineImportJournal> {
    if (
        !hasExactKeys(value, [
            "createdAt",
            "operationId",
            "phase",
            "policyDigest",
            "request",
            "requestDigest",
            "schema",
        ]) ||
        value.schema !== REVIEWED_SCHEMA_BASELINE_IMPORT_JOURNAL_SCHEMA ||
        !isStableIdentifier(value.operationId) ||
        !isImportPhase(value.phase) ||
        !isCanonicalTimestamp(value.createdAt) ||
        !isDigest(value.policyDigest) ||
        !isDigest(value.requestDigest)
    ) {
        throw new Error("Reviewed schema baseline import journal is invalid");
    }
    const identified = await identifyReviewedSchemaBaselineImportRequest(value.request);
    if (identified.digest !== value.requestDigest) {
        throw new Error("Reviewed schema baseline import journal request digest is inconsistent");
    }
    return {
        schema: REVIEWED_SCHEMA_BASELINE_IMPORT_JOURNAL_SCHEMA,
        operationId: value.operationId,
        phase: value.phase,
        createdAt: value.createdAt,
        policyDigest: value.policyDigest,
        requestDigest: identified.digest,
        request: identified.request,
    };
}

function hasExactKeys(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const keys = Object.keys(value);
    return keys.length === fields.length && fields.every((field) => keys.includes(field));
}

function isStableIdentifier(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

function isImportPhase(value: unknown): value is FsReviewedSchemaBaselineImportPhase {
    return FS_REVIEWED_SCHEMA_BASELINE_IMPORT_PHASES.some((phase) => phase === value);
}

function isDigest(value: unknown): value is string {
    return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isCanonicalTimestamp(value: unknown): value is string {
    if (typeof value !== "string") {
        return false;
    }
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}
