import {
    canonicalJsonBytes,
    DEFAULT_INTEGRATION_PACKAGE_LIMITS,
    type IntegrationPackageEnvelopeV1,
    type IntegrationPackageLimits,
    sha256Hex,
    validateIntegrationPackageEnvelope,
} from "@bernouy/cms-integration-packages";
import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import type { IntegrationCompatibilityAdmissionReport } from "../../../../interfaces/compatibility";
import { readCanonicalJsonFile, replaceCanonicalJson, writeCanonicalJsonNoReplace } from "./canonicalFile";
import { parseAdmissionReport } from "./report";

export const INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_SCHEMA =
    "cms.integration.registry.publication-journal.v1" as const;
const PUBLICATION_JOURNAL_METADATA_BYTES = 8 * 1_024 * 1_024;
export const MAX_INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_BYTES =
    DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes + PUBLICATION_JOURNAL_METADATA_BYTES;

export const FS_INTEGRATION_REGISTRY_PUBLICATION_PHASES = Object.freeze([
    "staged",
    "version-live",
    "manifest-written",
    "report-written",
    "index-written",
    "snapshot-swapped",
] as const);

export type FsIntegrationRegistryPublicationPhase = (typeof FS_INTEGRATION_REGISTRY_PUBLICATION_PHASES)[number];

export type FsIntegrationRegistryPublicationJournal = Readonly<{
    schema: typeof INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_SCHEMA;
    operationId: string;
    phase: FsIntegrationRegistryPublicationPhase;
    createdAt: string;
    kind: string;
    version: string;
    digest: string;
    envelope: IntegrationPackageEnvelopeV1;
    report: IntegrationCompatibilityAdmissionReport;
    previousIndex: IntegrationDefinitionIndex | null;
    nextIndex: IntegrationDefinitionIndex;
}>;

export async function createPublicationJournal(
    path: string,
    journal: FsIntegrationRegistryPublicationJournal,
    maxBytes = MAX_INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_BYTES,
): Promise<void> {
    await writeCanonicalJsonNoReplace(path, journal, maxBytes);
}

export async function writePublicationJournal(
    path: string,
    journal: FsIntegrationRegistryPublicationJournal,
    maxBytes = MAX_INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_BYTES,
): Promise<void> {
    await replaceCanonicalJson(path, journal, maxBytes);
}

export async function readPublicationJournal(
    path: string,
    options: Readonly<{
        packageLimits: Readonly<IntegrationPackageLimits>;
        expectedOperationId: string;
        maxBytes?: number;
    }>,
): Promise<FsIntegrationRegistryPublicationJournal | null> {
    const value = await readCanonicalJsonFile(
        path,
        options.maxBytes ?? publicationJournalByteLimit(options.packageLimits),
    );
    if (value === null) {
        return null;
    }
    if (!isPublicationJournalShape(value) || value.operationId !== options.expectedOperationId) {
        throw new Error(`Invalid integration registry publication journal: ${path}`);
    }
    const envelope = validateIntegrationPackageEnvelope(value.envelope, {
        limits: options.packageLimits,
        requireReleaseNotes: true,
    });
    const digest = await sha256Hex(canonicalJsonBytes(envelope));
    const report = parseAdmissionReport(value.report);
    if (
        digest !== value.digest ||
        envelope.kind !== value.kind ||
        envelope.version !== value.version ||
        report.kind !== value.kind ||
        report.version !== value.version ||
        report.packageDigest !== value.digest ||
        !report.admissible ||
        value.nextIndex.kind !== value.kind ||
        (value.previousIndex !== null && value.previousIndex.kind !== value.kind)
    ) {
        throw new Error(`Integration registry publication journal identity is inconsistent: ${path}`);
    }
    return { ...value, envelope, report } as FsIntegrationRegistryPublicationJournal;
}

export function publicationJournalByteLimit(limits: Readonly<IntegrationPackageLimits>): number {
    if (limits.maxDocumentBytes > Number.MAX_SAFE_INTEGER - PUBLICATION_JOURNAL_METADATA_BYTES) {
        throw new TypeError("Integration package document limit leaves no safe publication journal overhead");
    }
    return limits.maxDocumentBytes + PUBLICATION_JOURNAL_METADATA_BYTES;
}

function isPublicationJournalShape(value: unknown): value is FsIntegrationRegistryPublicationJournal {
    if (
        !hasExactKeys(value, [
            "createdAt",
            "digest",
            "envelope",
            "kind",
            "nextIndex",
            "operationId",
            "phase",
            "previousIndex",
            "report",
            "schema",
            "version",
        ]) ||
        value.schema !== INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_SCHEMA
    ) {
        return false;
    }
    return (
        typeof value.operationId === "string" &&
        /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.operationId) &&
        isPublicationPhase(value.phase) &&
        typeof value.createdAt === "string" &&
        Number.isFinite(Date.parse(value.createdAt)) &&
        isText(value.kind) &&
        isText(value.version) &&
        typeof value.digest === "string" &&
        /^[a-f0-9]{64}$/u.test(value.digest) &&
        isRecord(value.envelope) &&
        isRecord(value.report) &&
        (value.previousIndex === null || isRecord(value.previousIndex)) &&
        isRecord(value.nextIndex)
    );
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
    if (!isRecord(value)) {
        return false;
    }
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isText(value: unknown): value is string {
    return typeof value === "string" && Boolean(value.trim());
}

function isPublicationPhase(value: unknown): value is FsIntegrationRegistryPublicationPhase {
    return FS_INTEGRATION_REGISTRY_PUBLICATION_PHASES.some((phase) => phase === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
