import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import type { IntegrationRegistryVersionEligibilityRecord } from "../../../../../interfaces/promotion";
import {
    readCanonicalJsonFile,
    replaceCanonicalJson,
    writeCanonicalJsonNoReplace,
} from "../../persistence/canonicalFile";
import { nextVersionEligibilityIndex, sameIntegrationRegistryIndex } from "./channels";
import { MAX_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_DOCUMENT_BYTES, parseVersionEligibilityRecord } from "./document";

export const INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_JOURNAL_SCHEMA =
    "cms.integration.registry.version-eligibility-journal.v1" as const;
export const FS_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_PHASES = Object.freeze([
    "prepared",
    "index-written",
    "record-written",
    "snapshot-swapped",
] as const);

export type FsIntegrationRegistryVersionEligibilityPhase =
    (typeof FS_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_PHASES)[number];

export type FsIntegrationRegistryVersionEligibilityJournal = Readonly<{
    schema: typeof INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_JOURNAL_SCHEMA;
    operationId: string;
    phase: FsIntegrationRegistryVersionEligibilityPhase;
    createdAt: string;
    record: IntegrationRegistryVersionEligibilityRecord;
    previousIndex: IntegrationDefinitionIndex;
    nextIndex: IntegrationDefinitionIndex;
}>;

export async function createVersionEligibilityJournal(
    path: string,
    journal: FsIntegrationRegistryVersionEligibilityJournal,
): Promise<void> {
    await writeCanonicalJsonNoReplace(
        path,
        parseVersionEligibilityJournal(journal),
        MAX_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_DOCUMENT_BYTES,
    );
}

export async function writeVersionEligibilityJournal(
    path: string,
    journal: FsIntegrationRegistryVersionEligibilityJournal,
): Promise<void> {
    await replaceCanonicalJson(
        path,
        parseVersionEligibilityJournal(journal),
        MAX_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_DOCUMENT_BYTES,
    );
}

export async function readVersionEligibilityJournal(
    path: string,
    expectedOperationId: string,
): Promise<FsIntegrationRegistryVersionEligibilityJournal | null> {
    const value = await readCanonicalJsonFile(path, MAX_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_DOCUMENT_BYTES);
    if (value === null) {
        return null;
    }
    const journal = parseVersionEligibilityJournal(value);
    if (journal.operationId !== expectedOperationId) {
        throw new Error(`Version eligibility journal operation ID does not match its filename: ${path}`);
    }
    return journal;
}

export function parseVersionEligibilityJournal(value: unknown): FsIntegrationRegistryVersionEligibilityJournal {
    if (
        !hasExactKeys(value, ["createdAt", "nextIndex", "operationId", "phase", "previousIndex", "record", "schema"]) ||
        value.schema !== INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_JOURNAL_SCHEMA ||
        typeof value.operationId !== "string" ||
        !isPhase(value.phase) ||
        typeof value.createdAt !== "string" ||
        !isRecord(value.record) ||
        !isRecord(value.previousIndex) ||
        !isRecord(value.nextIndex)
    ) {
        throw new Error("Invalid integration registry version eligibility journal");
    }
    const record = parseVersionEligibilityRecord(value.record);
    const previousIndex = parseIntegrationDefinitionIndex(
        value.previousIndex,
        `eligibility:${value.operationId}:previous`,
    );
    const nextIndex = parseIntegrationDefinitionIndex(value.nextIndex, `eligibility:${value.operationId}:next`);
    const expectedNext = nextVersionEligibilityIndex(previousIndex, record.version, record.nextStatus);
    const previousEntry = previousIndex.versions.find((entry) => entry.version === record.version);
    if (
        value.operationId !== record.operationId ||
        value.createdAt !== record.createdAt ||
        record.kind !== previousIndex.kind ||
        record.kind !== nextIndex.kind ||
        previousEntry?.status !== record.previousStatus ||
        record.previousChannels.stable !== previousIndex.stable ||
        record.previousChannels.latest !== previousIndex.latest ||
        record.nextChannels.stable !== nextIndex.stable ||
        record.nextChannels.latest !== nextIndex.latest ||
        !sameIntegrationRegistryIndex(nextIndex, expectedNext)
    ) {
        throw new Error("Integration registry version eligibility journal identity is inconsistent");
    }
    return { ...value, record, previousIndex, nextIndex } as FsIntegrationRegistryVersionEligibilityJournal;
}

export function versionEligibilityPhaseAtLeast(
    current: FsIntegrationRegistryVersionEligibilityPhase,
    expected: FsIntegrationRegistryVersionEligibilityPhase,
): boolean {
    return (
        FS_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_PHASES.indexOf(current) >=
        FS_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_PHASES.indexOf(expected)
    );
}

function isPhase(value: unknown): value is FsIntegrationRegistryVersionEligibilityPhase {
    return FS_INTEGRATION_REGISTRY_VERSION_ELIGIBILITY_PHASES.some((phase) => phase === value);
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
    if (!isRecord(value)) {
        return false;
    }
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
