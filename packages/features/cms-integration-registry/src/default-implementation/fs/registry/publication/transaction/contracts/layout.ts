import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import {
    ensureVerifiedRegistryChildDirectory,
    readVerifiedRegistryDirectory,
} from "../../../persistence/ownedDirectory";
import type { IntegrationVerificationContractLineageKey } from "./types";

export const MAX_CONTRACT_LINEAGES_PER_KIND = 4_096;
export const MAX_CONTRACT_LINEAGE_REVISIONS = 128;

export type ContractLineagePaths = Readonly<{
    root: string;
    history: string;
    identity: string;
    revisions: string;
}>;

export async function ensureContractLineagePaths(
    registryRoot: string,
    key: IntegrationVerificationContractLineageKey,
): Promise<ContractLineagePaths> {
    await readVerifiedRegistryDirectory(registryRoot);
    const integration = join(registryRoot, key.kind);
    await readVerifiedRegistryDirectory(integration);
    const metadata = join(integration, ".registry");
    await readVerifiedRegistryDirectory(metadata);
    const root = await ensureVerifiedRegistryChildDirectory(metadata, "verification-contract-lineages");
    await assertHistoryCapacity(root, await keyDigest(key));
    const history = await ensureVerifiedRegistryChildDirectory(root, await keyDigest(key));
    const revisions = await ensureVerifiedRegistryChildDirectory(history, "revisions");
    return { root, history, identity: join(history, "identity.json"), revisions };
}

export async function listContractLineageHistories(registryRoot: string, kind: string): Promise<readonly string[]> {
    const root = join(registryRoot, kind, ".registry", "verification-contract-lineages");
    try {
        await readVerifiedRegistryDirectory(root);
        const handle = await opendir(root);
        const histories: string[] = [];
        for await (const entry of handle) {
            if (entry.isSymbolicLink() || !entry.isDirectory() || !/^[a-f0-9]{64}$/u.test(entry.name)) {
                throw new Error(`Invalid verification contract lineage entry: ${entry.name}`);
            }
            histories.push(join(root, entry.name));
            if (histories.length > MAX_CONTRACT_LINEAGES_PER_KIND) {
                throw new Error(
                    `Verification contract lineage store exceeds ${MAX_CONTRACT_LINEAGES_PER_KIND} entries`,
                );
            }
        }
        return histories.toSorted();
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
}

export function contractLineageRevisionFilename(ordinal: number): string {
    if (!Number.isSafeInteger(ordinal) || ordinal < 1 || ordinal > MAX_CONTRACT_LINEAGE_REVISIONS) {
        throw new TypeError("Verification contract lineage revision ordinal is invalid");
    }
    return `${ordinal.toString().padStart(4, "0")}.json`;
}

async function assertHistoryCapacity(root: string, expectedName: string): Promise<void> {
    const handle = await opendir(root);
    let count = 0;
    for await (const entry of handle) {
        if (entry.name === expectedName) {
            return;
        }
        count += 1;
        if (count >= MAX_CONTRACT_LINEAGES_PER_KIND) {
            throw new Error(
                `Verification contract lineage store already has ${MAX_CONTRACT_LINEAGES_PER_KIND} entries`,
            );
        }
    }
}

async function keyDigest(key: IntegrationVerificationContractLineageKey): Promise<string> {
    return await sha256Hex(canonicalJsonBytes(key));
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
