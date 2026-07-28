import { lstat, mkdir, readdir, realpath } from "node:fs/promises";
import { join } from "node:path";
import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import {
    readCanonicalJsonFile,
    removeFileIfExists,
    replaceCanonicalJson,
    writeCanonicalJsonNoReplace,
} from "../../../persistence/canonicalFile";
import type { FsIntegrationRegistryCandidateFinalizerConfig } from "./types";

const ACTIVATION_SCHEMA = "cms.integration.registry.candidate-activation.v1" as const;
const MAX_ACTIVATION_BYTES = 4 * 1_024 * 1_024;
const MAX_ACTIVATIONS = 4_096;
const ACTIVATION_FIELDS = new Set([
    "schema",
    "phase",
    "candidateId",
    "kind",
    "version",
    "packageDigest",
    "verificationDigest",
    "decisionRevisionId",
    "decisionDigest",
    "createdAt",
    "previousIndex",
    "nextIndex",
]);
const SHA256_DIGEST = /^[a-f0-9]{64}$/u;
const CANDIDATE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export type CandidateActivationJournal = Readonly<{
    schema: typeof ACTIVATION_SCHEMA;
    phase: "prepared" | "index-written" | "snapshot-swapped" | "candidate-published";
    candidateId: string;
    kind: string;
    version: string;
    packageDigest: string;
    verificationDigest: string;
    decisionRevisionId: string;
    decisionDigest: string;
    createdAt: string;
    previousIndex: IntegrationDefinitionIndex;
    nextIndex: IntegrationDefinitionIndex;
}>;

export function createCandidateActivationJournal(
    input: Omit<CandidateActivationJournal, "schema" | "phase">,
): CandidateActivationJournal {
    return Object.freeze({ schema: ACTIVATION_SCHEMA, phase: "prepared", ...input });
}

export async function candidateActivationJournalPath(root: string, candidateId: string): Promise<string> {
    if (!CANDIDATE_ID.test(candidateId)) {
        throw new TypeError("Candidate activation ID is invalid");
    }
    const metadata = await ensureChildDirectory(root, ".registry");
    const activations = await ensureChildDirectory(metadata, "candidate-activations");
    return join(activations, `${candidateId}.json`);
}

export async function listCandidateActivationJournals(
    root: string,
): Promise<readonly Readonly<{ path: string; journal: CandidateActivationJournal }>[]> {
    const activations = await ensureChildDirectory(
        await ensureChildDirectory(root, ".registry"),
        "candidate-activations",
    );
    const entries = await readdir(activations, { withFileTypes: true });
    if (entries.length > MAX_ACTIVATIONS) {
        throw new Error(`Candidate activation inventory exceeds ${MAX_ACTIVATIONS} entries`);
    }
    const journals = [];
    for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
        if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) {
            throw new Error(`Candidate activation inventory contains unexpected entry ${entry.name}`);
        }
        const path = join(activations, entry.name);
        const journal = await readCandidateActivationJournal(path);
        if (!journal) {
            continue;
        }
        if (entry.name !== `${journal.candidateId}.json`) {
            throw new Error(`Candidate activation journal filename does not match ${journal.candidateId}`);
        }
        journals.push(Object.freeze({ path, journal }));
    }
    return Object.freeze(journals);
}

export async function readCandidateActivationJournal(path: string): Promise<CandidateActivationJournal | null> {
    const value = await readCanonicalJsonFile(path, MAX_ACTIVATION_BYTES);
    if (value === null) {
        return null;
    }
    if (!isRecord(value) || value.schema !== ACTIVATION_SCHEMA || !isPhase(value.phase)) {
        throw new Error("Candidate activation journal is invalid");
    }
    if (Object.keys(value).some((field) => !ACTIVATION_FIELDS.has(field)) || Object.keys(value).length !== 12) {
        throw new Error("Candidate activation journal fields are invalid");
    }
    const candidateId = activationString(value, "candidateId");
    const kind = activationString(value, "kind");
    const version = activationString(value, "version");
    const packageDigest = activationString(value, "packageDigest");
    const verificationDigest = activationString(value, "verificationDigest");
    const decisionRevisionId = activationString(value, "decisionRevisionId");
    const decisionDigest = activationString(value, "decisionDigest");
    const createdAt = activationString(value, "createdAt");
    if (
        !CANDIDATE_ID.test(candidateId) ||
        !SHA256_DIGEST.test(packageDigest) ||
        !SHA256_DIGEST.test(verificationDigest) ||
        !SHA256_DIGEST.test(decisionDigest) ||
        !isCanonicalTimestamp(createdAt)
    ) {
        throw new Error("Candidate activation journal immutable identity is invalid");
    }
    return {
        schema: ACTIVATION_SCHEMA,
        phase: value.phase,
        candidateId,
        kind,
        version,
        packageDigest,
        verificationDigest,
        decisionRevisionId,
        decisionDigest,
        createdAt,
        previousIndex: parseIntegrationDefinitionIndex(value.previousIndex, `${path}.previousIndex`),
        nextIndex: parseIntegrationDefinitionIndex(value.nextIndex, `${path}.nextIndex`),
    };
}

export async function writeCandidateActivationJournal(path: string, journal: CandidateActivationJournal) {
    await writeCanonicalJsonNoReplace(path, journal, MAX_ACTIVATION_BYTES);
}

export async function advanceCandidateActivationJournal(
    path: string,
    journal: CandidateActivationJournal,
    phase: CandidateActivationJournal["phase"],
): Promise<CandidateActivationJournal> {
    if (phaseRank(journal.phase) >= phaseRank(phase)) {
        return journal;
    }
    const next = { ...journal, phase };
    await replaceCanonicalJson(path, next, MAX_ACTIVATION_BYTES);
    return next;
}

export async function removeCandidateActivationJournal(path: string): Promise<void> {
    await removeFileIfExists(path);
}

export function candidateActivationTimestamp(config: FsIntegrationRegistryCandidateFinalizerConfig): string {
    const value = config.now?.() ?? new Date().toISOString();
    if (!isCanonicalTimestamp(value)) {
        throw new TypeError("Candidate finalization time must be canonical ISO-8601");
    }
    return value;
}

async function ensureChildDirectory(parent: string, name: string): Promise<string> {
    const canonicalParent = await realpath(parent);
    if (canonicalParent !== parent) {
        throw new Error(`Candidate activation parent must be canonical: ${parent}`);
    }
    const path = join(parent, name);
    try {
        await mkdir(path, { mode: 0o750 });
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
    }
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink() || !metadata.isDirectory() || (await realpath(path)) !== path) {
        throw new Error(`Candidate activation directory must be a real canonical directory: ${path}`);
    }
    return path;
}

function activationString(value: Record<string, unknown>, field: string): string {
    const entry = value[field];
    if (typeof entry !== "string" || entry.length === 0) {
        throw new Error(`Candidate activation journal ${field} is invalid`);
    }
    return entry;
}

function phaseRank(phase: CandidateActivationJournal["phase"]): number {
    return ["prepared", "index-written", "snapshot-swapped", "candidate-published"].indexOf(phase);
}

function isPhase(value: unknown): value is CandidateActivationJournal["phase"] {
    return (
        value === "prepared" ||
        value === "index-written" ||
        value === "snapshot-swapped" ||
        value === "candidate-published"
    );
}

function isCanonicalTimestamp(value: string): boolean {
    const milliseconds = Date.parse(value);
    return Number.isFinite(milliseconds) && new Date(milliseconds).toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
