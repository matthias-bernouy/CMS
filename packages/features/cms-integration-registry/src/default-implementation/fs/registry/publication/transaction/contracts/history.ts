import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { readCanonicalJsonFile, writeCanonicalJsonNoReplace } from "../../../persistence/canonicalFile";
import { readVerifiedRegistryDirectory } from "../../../persistence/ownedDirectory";
import {
    contractLineageIdentityDocument,
    parseContractLineageIdentity,
    parseContractLineageRevisionDocument,
} from "./document";
import { integrationVerificationContractLineageId } from "./identity";
import { contractLineageRevisionFilename, MAX_CONTRACT_LINEAGE_REVISIONS } from "./layout";
import type {
    IntegrationVerificationContractLineageKey,
    IntegrationVerificationContractLineageRevision,
} from "./types";

export const MAX_CONTRACT_LINEAGE_DOCUMENT_BYTES = 64 * 1_024;

export async function ensureContractLineageIdentity(
    path: string,
    key: IntegrationVerificationContractLineageKey,
): Promise<void> {
    try {
        await writeCanonicalJsonNoReplace(
            path,
            contractLineageIdentityDocument(key),
            MAX_CONTRACT_LINEAGE_DOCUMENT_BYTES,
        );
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
    }
    const stored = await readCanonicalJsonFile(path, MAX_CONTRACT_LINEAGE_DOCUMENT_BYTES);
    if (!stored || !sameCanonical(parseContractLineageIdentity(stored), key)) {
        throw new Error("Verification contract lineage identity is absent or substituted");
    }
}

export async function readContractLineageHistory(historyPath: string) {
    await readVerifiedRegistryDirectory(historyPath);
    const identityValue = await readCanonicalJsonFile(
        join(historyPath, "identity.json"),
        MAX_CONTRACT_LINEAGE_DOCUMENT_BYTES,
    );
    if (!identityValue) {
        throw new Error("Verification contract lineage identity is missing");
    }
    const key = parseContractLineageIdentity(identityValue);
    const revisionsPath = join(historyPath, "revisions");
    await readVerifiedRegistryDirectory(revisionsPath);
    const entries = await revisionEntries(revisionsPath);
    const revisions: IntegrationVerificationContractLineageRevision[] = [];
    for (let index = 0; index < entries.length; index += 1) {
        const filename = entries[index]!;
        if (filename !== contractLineageRevisionFilename(index + 1)) {
            throw new Error("Verification contract lineage revision ordinals are not contiguous");
        }
        const value = await readCanonicalJsonFile(join(revisionsPath, filename), MAX_CONTRACT_LINEAGE_DOCUMENT_BYTES);
        if (!value) {
            throw new Error(`Verification contract lineage revision disappeared: ${filename}`);
        }
        const revision = parseContractLineageRevisionDocument(value);
        if (
            revision.kind !== key.kind ||
            revision.contractId !== key.contractId ||
            revision.lineageId !== (await integrationVerificationContractLineageId(key.kind, key.contractId)) ||
            (revisions.at(-1) && revisions.at(-1)!.createdAt > revision.createdAt)
        ) {
            throw new Error("Verification contract lineage history is reordered or changes identity");
        }
        revisions.push(revision);
    }
    return Object.freeze({ key, revisions: Object.freeze(revisions) });
}

export function sameCanonical(left: unknown, right: unknown): boolean {
    const leftBytes = canonicalJsonBytes(left);
    const rightBytes = canonicalJsonBytes(right);
    return (
        leftBytes.byteLength === rightBytes.byteLength && leftBytes.every((byte, index) => byte === rightBytes[index])
    );
}

async function revisionEntries(path: string): Promise<string[]> {
    const handle = await opendir(path);
    const entries: string[] = [];
    for await (const entry of handle) {
        if (entry.isSymbolicLink() || !entry.isFile() || !/^\d{4}\.json$/u.test(entry.name)) {
            throw new Error(`Invalid verification contract lineage revision entry: ${entry.name}`);
        }
        entries.push(entry.name);
        if (entries.length > MAX_CONTRACT_LINEAGE_REVISIONS) {
            throw new Error("Verification contract lineage revision limit exceeded");
        }
    }
    return entries.toSorted();
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
