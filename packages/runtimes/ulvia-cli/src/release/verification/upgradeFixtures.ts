import {
    defineUpgradeScenarios,
    type UpgradeFixtureScenarioV1,
    type UpgradeFixtureSuiteV1,
} from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";
import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

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
    const specifier = `${pathToFileURL(path).href}?v=${metadata.mtimeMs}-${metadata.size}`;
    const loaded = (await import(specifier)) as Readonly<{ default?: unknown }>;
    try {
        return defineUpgradeScenarios(loaded.default as UpgradeFixtureSuiteV1);
    } catch (error) {
        throw new Error(`Invalid upgrade fixture module at ${FIXTURE_MODULE}`, { cause: error });
    }
}

export function upgradeFixturesForBaseline(
    suite: UpgradeFixtureSuiteV1 | null,
    baselineVersion: string,
): readonly UpgradeFixtureScenarioV1[] {
    if (!suite) {
        return [];
    }
    const matching = suite.scenarios.filter((scenario) => integrationVersionSatisfies(baselineVersion, scenario.from));
    if (!matching.length) {
        throw new Error(`Upgrade fixtures do not cover immutable baseline ${baselineVersion}`);
    }
    return matching;
}
