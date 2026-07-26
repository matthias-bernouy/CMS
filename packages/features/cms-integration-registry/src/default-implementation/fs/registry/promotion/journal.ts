import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import type { IntegrationRegistryStablePromotionRecord } from "../../../../interfaces/promotion";
import { readCanonicalJsonFile, replaceCanonicalJson, writeCanonicalJsonNoReplace } from "../persistence/canonicalFile";
import { parseStablePromotionRecord } from "./document";
import { nextStableIntegrationRegistryIndex, sameIntegrationRegistryIndex } from "./index";

export const INTEGRATION_REGISTRY_STABLE_PROMOTION_JOURNAL_SCHEMA =
    "cms.integration.registry.stable-promotion-journal.v1" as const;
export const MAX_INTEGRATION_REGISTRY_STABLE_PROMOTION_JOURNAL_BYTES = 2 * 1_024 * 1_024;

export const FS_INTEGRATION_REGISTRY_STABLE_PROMOTION_PHASES = Object.freeze([
    "prepared",
    "index-written",
    "record-written",
    "snapshot-swapped",
] as const);

export type FsIntegrationRegistryStablePromotionPhase =
    (typeof FS_INTEGRATION_REGISTRY_STABLE_PROMOTION_PHASES)[number];

export type FsIntegrationRegistryStablePromotionJournal = Readonly<{
    schema: typeof INTEGRATION_REGISTRY_STABLE_PROMOTION_JOURNAL_SCHEMA;
    operationId: string;
    phase: FsIntegrationRegistryStablePromotionPhase;
    createdAt: string;
    record: IntegrationRegistryStablePromotionRecord;
    previousIndex: IntegrationDefinitionIndex;
    nextIndex: IntegrationDefinitionIndex;
}>;

export async function createStablePromotionJournal(
    path: string,
    journal: FsIntegrationRegistryStablePromotionJournal,
): Promise<void> {
    await writeCanonicalJsonNoReplace(
        path,
        parseStablePromotionJournal(journal),
        MAX_INTEGRATION_REGISTRY_STABLE_PROMOTION_JOURNAL_BYTES,
    );
}

export async function writeStablePromotionJournal(
    path: string,
    journal: FsIntegrationRegistryStablePromotionJournal,
): Promise<void> {
    await replaceCanonicalJson(
        path,
        parseStablePromotionJournal(journal),
        MAX_INTEGRATION_REGISTRY_STABLE_PROMOTION_JOURNAL_BYTES,
    );
}

export async function readStablePromotionJournal(
    path: string,
    expectedOperationId: string,
): Promise<FsIntegrationRegistryStablePromotionJournal | null> {
    const value = await readCanonicalJsonFile(path, MAX_INTEGRATION_REGISTRY_STABLE_PROMOTION_JOURNAL_BYTES);
    if (value === null) {
        return null;
    }
    const journal = parseStablePromotionJournal(value);
    if (journal.operationId !== expectedOperationId) {
        throw new Error(`Stable promotion journal operation ID does not match its filename: ${path}`);
    }
    return journal;
}

export function parseStablePromotionJournal(value: unknown): FsIntegrationRegistryStablePromotionJournal {
    if (
        !hasExactKeys(value, ["createdAt", "nextIndex", "operationId", "phase", "previousIndex", "record", "schema"]) ||
        value.schema !== INTEGRATION_REGISTRY_STABLE_PROMOTION_JOURNAL_SCHEMA ||
        !isPathSafeId(value.operationId) ||
        !isStablePromotionPhase(value.phase) ||
        typeof value.createdAt !== "string" ||
        !Number.isFinite(Date.parse(value.createdAt)) ||
        !isRecord(value.record) ||
        !isRecord(value.previousIndex) ||
        !isRecord(value.nextIndex)
    ) {
        throw new Error("Invalid integration registry stable promotion journal");
    }
    const record = parseStablePromotionRecord(value.record);
    const previousIndex = parseIntegrationDefinitionIndex(
        value.previousIndex,
        `stable-promotion:${value.operationId}:previous-index`,
    );
    const nextIndex = parseIntegrationDefinitionIndex(
        value.nextIndex,
        `stable-promotion:${value.operationId}:next-index`,
    );
    const expectedNext = nextStableIntegrationRegistryIndex(previousIndex, record.version);
    if (
        value.operationId !== record.operationId ||
        value.createdAt !== record.createdAt ||
        record.kind !== previousIndex.kind ||
        record.kind !== nextIndex.kind ||
        record.previousStable !== previousIndex.stable ||
        !sameIntegrationRegistryIndex(nextIndex, expectedNext)
    ) {
        throw new Error("Integration registry stable promotion journal identity is inconsistent");
    }
    return { ...value, record, previousIndex, nextIndex } as FsIntegrationRegistryStablePromotionJournal;
}

export function stablePromotionPhaseAtLeast(
    current: FsIntegrationRegistryStablePromotionPhase,
    expected: FsIntegrationRegistryStablePromotionPhase,
): boolean {
    return (
        FS_INTEGRATION_REGISTRY_STABLE_PROMOTION_PHASES.indexOf(current) >=
        FS_INTEGRATION_REGISTRY_STABLE_PROMOTION_PHASES.indexOf(expected)
    );
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
    if (!isRecord(value)) {
        return false;
    }
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isStablePromotionPhase(value: unknown): value is FsIntegrationRegistryStablePromotionPhase {
    return FS_INTEGRATION_REGISTRY_STABLE_PROMOTION_PHASES.some((phase) => phase === value);
}

function isPathSafeId(value: unknown): value is string {
    return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
