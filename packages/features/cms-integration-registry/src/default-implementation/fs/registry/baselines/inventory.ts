import { opendir } from "node:fs/promises";
import { join } from "node:path";
import { ReviewedSchemaBaselineIntegrityError } from "../../../../core/compatibility/reportStoreErrors";
import type { ReviewedSchemaBaselineHistory } from "../../../../interfaces/reportStore";
import { withVerifiedRegistryDirectory } from "../persistence/ownedDirectory";
import {
    compareReviewedSchemaBaselineKey,
    loadReviewedSchemaBaselineHistory,
    requireReviewedSchemaBaselineHistory,
} from "./history";
import { assertReviewedSchemaBaselinePackageIdentity, reviewedSchemaBaselineRoot } from "./layout";

const MAX_BASELINE_HISTORIES = 4_096;

export async function listReviewedSchemaBaselinesForPackage(
    registryRoot: string,
    kind: string,
    version: string,
    packageDigest: string,
): Promise<readonly ReviewedSchemaBaselineHistory[]> {
    assertReviewedSchemaBaselinePackageIdentity(kind, version, packageDigest);
    const root = reviewedSchemaBaselineRoot(registryRoot);
    let names: string[];
    try {
        names = await readHistoryNames(root);
    } catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return [];
        }
        throw error;
    }
    const histories: ReviewedSchemaBaselineHistory[] = [];
    for (const name of names) {
        const history = requireReviewedSchemaBaselineHistory(await loadReviewedSchemaBaselineHistory(join(root, name)));
        if (
            history.logicalKey.kind === kind &&
            history.logicalKey.version === version &&
            history.logicalKey.packageDigest === packageDigest
        ) {
            histories.push(history);
        }
    }
    return histories.sort((left, right) => compareReviewedSchemaBaselineKey(left.logicalKey, right.logicalKey));
}

async function readHistoryNames(root: string): Promise<string[]> {
    return await withVerifiedRegistryDirectory(root, async (descriptorPath) => {
        const handle = await opendir(descriptorPath);
        const names: string[] = [];
        for await (const entry of handle) {
            if (entry.isSymbolicLink() || !entry.isDirectory() || !/^[a-f0-9]{64}$/u.test(entry.name)) {
                throw new ReviewedSchemaBaselineIntegrityError(
                    `Invalid reviewed schema baseline history: ${entry.name}`,
                );
            }
            names.push(entry.name);
            if (names.length > MAX_BASELINE_HISTORIES) {
                throw new ReviewedSchemaBaselineIntegrityError(
                    `Reviewed schema baseline store exceeds ${MAX_BASELINE_HISTORIES} histories`,
                );
            }
        }
        return names.sort();
    });
}

function isNodeError(value: unknown): value is NodeJS.ErrnoException {
    return value instanceof Error && "code" in value;
}
