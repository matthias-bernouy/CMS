import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ensureVerifiedRegistryChildDirectory, readVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";

export type FsIntegrationVerificationBackfillStorage = Readonly<{
    root: string;
    journals: string;
}>;

export async function ensureIntegrationVerificationBackfillStorage(
    registryRoot: string,
): Promise<FsIntegrationVerificationBackfillStorage> {
    await readVerifiedRegistryDirectory(registryRoot);
    const metadata = join(registryRoot, ".registry");
    try {
        await mkdir(metadata, { mode: 0o750 });
    } catch (error) {
        if (!isNodeError(error) || error.code !== "EEXIST") {
            throw error;
        }
    }
    await readVerifiedRegistryDirectory(metadata);
    const root = await ensureVerifiedRegistryChildDirectory(metadata, "verification-backfills");
    const journals = await ensureVerifiedRegistryChildDirectory(root, "journals");
    return { root, journals };
}

export function integrationVerificationBackfillJournalPath(
    storage: FsIntegrationVerificationBackfillStorage,
    operationId: string,
): string {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(operationId)) {
        throw new TypeError("Integration verification backfill operation ID is invalid");
    }
    return join(storage.journals, `${operationId}.json`);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
