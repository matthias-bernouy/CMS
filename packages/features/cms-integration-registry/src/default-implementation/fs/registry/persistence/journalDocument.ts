import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import type { IntegrationCompatibilityAdmissionReport } from "../../../../interfaces/compatibility";

export const INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_SCHEMA =
    "cms.integration.registry.publication-journal.v2" as const;
const LEGACY_INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_SCHEMA =
    "cms.integration.registry.publication-journal.v1" as const;

export const FS_INTEGRATION_REGISTRY_PUBLICATION_PHASES = Object.freeze([
    "staged",
    "version-live",
    "manifest-written",
    "report-written",
    "index-written",
    "snapshot-swapped",
] as const);

export type FsIntegrationRegistryPublicationPhase = (typeof FS_INTEGRATION_REGISTRY_PUBLICATION_PHASES)[number];

export type FsIntegrationRegistryPublicationDisposition = Readonly<{
    disposition: "installable" | "unverified";
    verificationDigest?: string;
}>;

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
    publication: FsIntegrationRegistryPublicationDisposition;
    previousIndex: IntegrationDefinitionIndex | null;
    nextIndex: IntegrationDefinitionIndex;
}>;

const COMMON_KEYS = [
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
] as const;

export function parsePublicationJournalDocument(
    value: unknown,
    source: string,
): FsIntegrationRegistryPublicationJournal | null {
    if (!isRecord(value)) {
        return null;
    }
    const legacy = value.schema === LEGACY_INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_SCHEMA;
    const current = value.schema === INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_SCHEMA;
    if (!legacy && !current) {
        return null;
    }
    if (!hasExactKeys(value, current ? [...COMMON_KEYS, "publication"] : COMMON_KEYS)) {
        return null;
    }
    if (
        typeof value.operationId !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value.operationId) ||
        !isPublicationPhase(value.phase) ||
        typeof value.createdAt !== "string" ||
        !Number.isFinite(Date.parse(value.createdAt)) ||
        !isText(value.kind) ||
        !isText(value.version) ||
        typeof value.digest !== "string" ||
        !isDigest(value.digest) ||
        !isRecord(value.envelope) ||
        !isRecord(value.report) ||
        (value.previousIndex !== null && !isRecord(value.previousIndex)) ||
        !isRecord(value.nextIndex)
    ) {
        return null;
    }
    const previousIndex = value.previousIndex
        ? parseIntegrationDefinitionIndex(value.previousIndex, `${source}:previousIndex`)
        : null;
    const nextIndex = parseIntegrationDefinitionIndex(value.nextIndex, `${source}:nextIndex`);
    const publication = current
        ? parsePublicationDisposition(value.publication)
        : legacyPublicationDisposition(nextIndex, value.version);
    if (!publication) {
        return null;
    }
    return {
        schema: INTEGRATION_REGISTRY_PUBLICATION_JOURNAL_SCHEMA,
        operationId: value.operationId,
        phase: value.phase,
        createdAt: value.createdAt,
        kind: value.kind,
        version: value.version,
        digest: value.digest,
        envelope: value.envelope as unknown as IntegrationPackageEnvelopeV1,
        report: value.report as IntegrationCompatibilityAdmissionReport,
        publication,
        previousIndex,
        nextIndex,
    };
}

function parsePublicationDisposition(value: unknown): FsIntegrationRegistryPublicationDisposition | null {
    if (!isRecord(value)) {
        return null;
    }
    const hasVerificationDigest = Object.hasOwn(value, "verificationDigest");
    if (!hasExactKeys(value, hasVerificationDigest ? ["disposition", "verificationDigest"] : ["disposition"])) {
        return null;
    }
    if (value.disposition !== "installable" && value.disposition !== "unverified") {
        return null;
    }
    if (
        hasVerificationDigest &&
        (typeof value.verificationDigest !== "string" || !isDigest(value.verificationDigest))
    ) {
        return null;
    }
    return {
        disposition: value.disposition,
        ...(typeof value.verificationDigest === "string" ? { verificationDigest: value.verificationDigest } : {}),
    };
}

function legacyPublicationDisposition(
    nextIndex: IntegrationDefinitionIndex,
    version: string,
): FsIntegrationRegistryPublicationDisposition | null {
    const entries = nextIndex.versions.filter((entry) => entry.version === version);
    if (entries.length !== 1) {
        return null;
    }
    const entry = entries[0]!;
    if (entry.status === "blocked" || entry.status === "inadmissible") {
        return null;
    }
    return {
        disposition: entry.status === "unverified" ? "unverified" : "installable",
        ...(entry.verificationDigest ? { verificationDigest: entry.verificationDigest } : {}),
    };
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}

function isDigest(value: string): boolean {
    return /^[a-f0-9]{64}$/u.test(value);
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
