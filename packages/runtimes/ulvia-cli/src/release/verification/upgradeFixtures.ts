import { loadUpgradeFixtureSuiteModule } from "@bernouy/cms-integration-verification/bun";
import type { UpgradeFixtureSuiteV1 } from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";
import { lstat } from "node:fs/promises";
import { join } from "node:path";

const FIXTURE_MODULE = join("tests", "integration-contracts", "upgrade-fixtures.ts");

export async function loadUpgradeFixtureSuite(sourceRoot: string): Promise<UpgradeFixtureSuiteV1 | null> {
    const path = join(sourceRoot, FIXTURE_MODULE);
    const metadata = await lstat(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (!metadata) {
        return null;
    }
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
        throw new Error(`Upgrade fixture module must be a regular non-symlink file at ${FIXTURE_MODULE}`);
    }
    try {
        return await loadUpgradeFixtureSuiteModule(path);
    } catch (error) {
        const message = error instanceof Error && error.message ? error.message : String(error);
        const detail = message ? `: ${message.slice(0, 512)}` : "";
        throw new Error(`Invalid upgrade fixture module at ${FIXTURE_MODULE}${detail}`, { cause: error });
    }
}
