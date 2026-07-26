import { lstat } from "node:fs/promises";
import { canonicalJsonBytes, type IntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import type { IntegrationDefinitionIndex } from "@bernouy/cms-integrations";
import { parseIntegrationDefinitionIndex } from "@bernouy/cms-integrations/fs";
import { readJsonFile } from "../persistence/canonicalFile";
import type { FsIntegrationRegistryPublicationJournal } from "../persistence/journal";
import {
    prepareFsIntegrationRegistryCandidate,
    type PreparedFsIntegrationRegistryCandidate,
} from "../publication/candidate";
import { nextIntegrationRegistryIndex } from "../publication/index";

const MAX_INDEX_DOCUMENT_BYTES = 2 * 1_024 * 1_024;

export async function validateRecoveryJournal(
    journal: FsIntegrationRegistryPublicationJournal,
    packageLimits: Readonly<IntegrationPackageLimits>,
): Promise<PreparedFsIntegrationRegistryCandidate> {
    const canonicalBytes = canonicalJsonBytes(journal.envelope);
    const candidate = await prepareFsIntegrationRegistryCandidate(
        { envelope: journal.envelope, canonicalBytes, digest: journal.digest },
        packageLimits,
    );
    const previous = parseOptionalIndex(journal.previousIndex, `journal:${journal.operationId}:previousIndex`);
    const next = parseIntegrationDefinitionIndex(journal.nextIndex, `journal:${journal.operationId}:nextIndex`);
    const expected = nextIntegrationRegistryIndex(previous, candidate.definition, candidate.package.envelope);
    if (!sameJson(expected, next)) {
        throw new Error("Integration registry publication journal next index cannot be reproduced");
    }
    return candidate;
}

export async function readCurrentIntegrationIndex(path: string): Promise<IntegrationDefinitionIndex | null> {
    const captured = await readJsonFile(path, MAX_INDEX_DOCUMENT_BYTES);
    return captured ? parseIntegrationDefinitionIndex(captured.value, path) : null;
}

export function sameIndex(left: IntegrationDefinitionIndex | null, right: IntegrationDefinitionIndex | null): boolean {
    return left === null || right === null ? left === right : sameJson(left, right);
}

export async function verifyRecoveryPackageRoot(
    root: string,
    candidate: PreparedFsIntegrationRegistryCandidate,
): Promise<void> {
    const result = await readIntegrationPackageDirectory({
        root,
        kind: candidate.definition.kind,
        version: candidate.package.envelope.version,
        definition: candidate.package.envelope.definition,
        releaseNotes: candidate.package.envelope.releaseNotes!,
        expectedEnvelope: candidate.package.envelope,
        limits: candidate.limits,
    });
    if (result.digest !== candidate.package.digest) {
        throw new Error("Recovered integration package root does not reproduce its journal digest");
    }
}

export async function pathExists(path: string): Promise<boolean> {
    try {
        await lstat(path);
        return true;
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return false;
        }
        throw error;
    }
}

function parseOptionalIndex(
    value: IntegrationDefinitionIndex | null,
    source: string,
): IntegrationDefinitionIndex | null {
    return value ? parseIntegrationDefinitionIndex(value, source) : null;
}

function sameJson(left: unknown, right: unknown): boolean {
    const leftBytes = canonicalJsonBytes(left);
    const rightBytes = canonicalJsonBytes(right);
    return (
        leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
