import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ensureVerifiedRegistryChildDirectory, readVerifiedRegistryDirectory } from "../../persistence/ownedDirectory";

export const REVIEWED_SCHEMA_BASELINE_IMPORT_DIRECTORY = "schema-baseline-imports";

export type FsReviewedSchemaBaselineImportStorage = Readonly<{
    root: string;
    journals: string;
}>;

export async function ensureReviewedSchemaBaselineImportStorage(
    registryRoot: string,
): Promise<FsReviewedSchemaBaselineImportStorage> {
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
    const root = await ensureVerifiedRegistryChildDirectory(metadata, REVIEWED_SCHEMA_BASELINE_IMPORT_DIRECTORY);
    const journals = await ensureVerifiedRegistryChildDirectory(root, "journals");
    return { root, journals };
}

export function reviewedSchemaBaselineImportJournalPath(
    storage: FsReviewedSchemaBaselineImportStorage,
    operationId: string,
) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(operationId)) {
        throw new TypeError("Reviewed schema baseline import operation ID is invalid");
    }
    return join(storage.journals, `${operationId}.json`);
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
