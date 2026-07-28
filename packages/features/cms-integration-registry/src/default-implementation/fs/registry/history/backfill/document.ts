import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import { identifyIntegrationVerificationBackfillRequest } from "../../../../../core/publication/backfill";
import type { IntegrationVerificationBackfillRequest } from "../../../../../interfaces/publication";
import {
    readCanonicalJsonFile,
    replaceCanonicalJson,
    writeCanonicalJsonNoReplace,
} from "../../persistence/canonicalFile";

export const INTEGRATION_VERIFICATION_BACKFILL_JOURNAL_SCHEMA =
    "cms.integration.registry.verification-backfill-journal.v1" as const;
export const MAX_INTEGRATION_VERIFICATION_BACKFILL_DOCUMENT_BYTES = 40 * 1_024 * 1_024;
export const MAX_INTEGRATION_VERIFICATION_BACKFILL_JOURNAL_BYTES =
    MAX_INTEGRATION_VERIFICATION_BACKFILL_DOCUMENT_BYTES + 8 * 1_024 * 1_024;
export const FS_INTEGRATION_VERIFICATION_BACKFILL_PHASES = Object.freeze([
    "prepared",
    "bundle-written",
    "compatibility-written",
    "verification-written",
    "decision-written",
    "activation-prepared",
    "index-written",
    "snapshot-swapped",
] as const);

export type FsIntegrationVerificationBackfillPhase = (typeof FS_INTEGRATION_VERIFICATION_BACKFILL_PHASES)[number];

export type FsIntegrationVerificationBackfillActivation = Readonly<{
    previousIndex: IntegrationDefinitionIndex;
    nextIndex: IntegrationDefinitionIndex;
}>;

export type FsIntegrationVerificationBackfillJournal = Readonly<{
    schema: typeof INTEGRATION_VERIFICATION_BACKFILL_JOURNAL_SCHEMA;
    operationId: string;
    phase: FsIntegrationVerificationBackfillPhase;
    createdAt: string;
    requestDigest: string;
    request: IntegrationVerificationBackfillRequest;
    activation: FsIntegrationVerificationBackfillActivation | null;
}>;

export async function createIntegrationVerificationBackfillJournal(
    path: string,
    journal: FsIntegrationVerificationBackfillJournal,
): Promise<void> {
    await writeCanonicalJsonNoReplace(
        path,
        await parseJournal(journal),
        MAX_INTEGRATION_VERIFICATION_BACKFILL_JOURNAL_BYTES,
    );
}

export async function writeIntegrationVerificationBackfillJournal(
    path: string,
    journal: FsIntegrationVerificationBackfillJournal,
): Promise<void> {
    await replaceCanonicalJson(path, await parseJournal(journal), MAX_INTEGRATION_VERIFICATION_BACKFILL_JOURNAL_BYTES);
}

export async function readIntegrationVerificationBackfillJournal(
    path: string,
    expectedOperationId: string,
): Promise<FsIntegrationVerificationBackfillJournal | null> {
    const value = await readCanonicalJsonFile(path, MAX_INTEGRATION_VERIFICATION_BACKFILL_JOURNAL_BYTES);
    if (value === null) {
        return null;
    }
    const journal = await parseJournal(value);
    if (journal.operationId !== expectedOperationId) {
        throw new Error("Integration verification backfill journal operation ID differs from its filename");
    }
    return journal;
}

async function parseJournal(value: unknown): Promise<FsIntegrationVerificationBackfillJournal> {
    if (
        !hasExactKeys(value, [
            "activation",
            "createdAt",
            "operationId",
            "phase",
            "request",
            "requestDigest",
            "schema",
        ]) ||
        value.schema !== INTEGRATION_VERIFICATION_BACKFILL_JOURNAL_SCHEMA ||
        !isIdentifier(value.operationId) ||
        !isPhase(value.phase) ||
        !isTimestamp(value.createdAt) ||
        !isDigest(value.requestDigest)
    ) {
        throw new Error("Integration verification backfill journal is invalid");
    }
    const identified = await identifyIntegrationVerificationBackfillRequest(value.request);
    if (identified.digest !== value.requestDigest) {
        throw new Error("Integration verification backfill journal request digest is inconsistent");
    }
    return {
        schema: INTEGRATION_VERIFICATION_BACKFILL_JOURNAL_SCHEMA,
        operationId: value.operationId,
        phase: value.phase,
        createdAt: value.createdAt,
        requestDigest: identified.digest,
        request: identified.request,
        activation: parseActivation(value.activation),
    };
}

function parseActivation(value: unknown): FsIntegrationVerificationBackfillActivation | null {
    if (value === null) {
        return null;
    }
    if (!hasExactKeys(value, ["nextIndex", "previousIndex"])) {
        throw new Error("Integration verification backfill activation is invalid");
    }
    return {
        previousIndex: parseIntegrationDefinitionIndex(value.previousIndex, "verification-backfill:previousIndex"),
        nextIndex: parseIntegrationDefinitionIndex(value.nextIndex, "verification-backfill:nextIndex"),
    };
}

function hasExactKeys(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const keys = Object.keys(value);
    return keys.length === fields.length && fields.every((field) => keys.includes(field));
}

function isIdentifier(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

function isDigest(value: unknown): value is string {
    return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isPhase(value: unknown): value is FsIntegrationVerificationBackfillPhase {
    return FS_INTEGRATION_VERIFICATION_BACKFILL_PHASES.some((phase) => phase === value);
}

function isTimestamp(value: unknown): value is string {
    if (typeof value !== "string") {
        return false;
    }
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}
