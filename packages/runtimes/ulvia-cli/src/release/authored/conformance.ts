import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
    admitConformanceSuiteJson,
    DEFAULT_RELEASE_LIMITS,
    parseConformanceSuiteJson,
    type AdmittedConformanceSuite,
    type AdmittedContractRelease,
} from "@bernouy/cms-repository/contracts";
import {
    assertUniqueSourceIds,
    compareOrdinal,
    readJsonSourceRecord,
    readJsonSourceTree,
    readOptionalJsonSourceRecord,
    sourceId,
    type JsonSourceRecord,
} from "./jsonFragments";

/** Assemble recursive conformance sources without coupling them to contract publication. */
export async function compileConformanceSource(directory: string): Promise<string | undefined> {
    const legacy = await readOptionalJsonSourceRecord(join(directory, "conformance.json"), "conformance.json");
    const definition = await readOptionalJsonSourceRecord(
        join(directory, "conformance", "definition.json"),
        "conformance/definition.json",
    );
    if (legacy && definition) {
        throw new Error("Use either conformance.json or conformance/, never both");
    }
    if (legacy) {
        return JSON.stringify(legacy.value);
    }
    if (!definition) {
        return undefined;
    }
    if (Object.hasOwn(definition.value, "scenarios") || Object.hasOwn(definition.value, "coverageExemptions")) {
        throw new Error("conformance/definition.json must keep scenarios and exemptions in their source trees");
    }
    const scenarios = await readJsonSourceTree(join(directory, "conformance", "scenarios"), "conformance/scenarios");
    if (!scenarios?.length) {
        throw new Error("conformance/scenarios/ must contain at least one JSON scenario fragment");
    }
    assertUniqueSourceIds(scenarios, "id", "Conformance scenario");
    const orderedScenarios = scenarios
        .slice()
        .sort((left, right) => compareOrdinal(sourceId(left, "id"), sourceId(right, "id")))
        .map((scenario) => scenario.value);
    const exemptions = await orderedExemptions(directory);
    return JSON.stringify({
        ...definition.value,
        scenarios: orderedScenarios,
        ...(exemptions.length ? { coverageExemptions: exemptions.map((item) => item.value) } : {}),
    });
}

export async function prepareConformanceSource(
    directory: string,
    release: AdmittedContractRelease,
    dependencies: readonly AdmittedContractRelease[] = [],
    compiledSource?: string,
): Promise<Readonly<{ sourceJson: string; admission: AdmittedConformanceSuite }> | undefined> {
    const sourceJson = compiledSource ?? (await compileConformanceSource(directory));
    if (!sourceJson) {
        return undefined;
    }
    const parsed = parseConformanceSuiteJson(sourceJson, release, DEFAULT_RELEASE_LIMITS, dependencies);
    const assets = await Promise.all(
        (parsed.fixtureAssets ?? []).map(async ({ id }) => ({
            id,
            bytes: await readFile(join(directory, "conformance", "fixtures", id)),
        })),
    );
    const admission = await admitConformanceSuiteJson(
        sourceJson,
        release,
        assets,
        DEFAULT_RELEASE_LIMITS,
        dependencies,
    );
    return { sourceJson, admission };
}

async function orderedExemptions(directory: string): Promise<JsonSourceRecord[]> {
    const fragments =
        (await readJsonSourceTree(join(directory, "conformance", "exemptions"), "conformance/exemptions")) ?? [];
    const keys = new Map<string, string>();
    for (const fragment of fragments) {
        const capabilityId = sourceId(fragment, "capabilityId");
        const errorCode = fragment.value.errorCode;
        if (errorCode !== undefined && typeof errorCode !== "string") {
            throw new Error(`${fragment.source} errorCode must be a string when present`);
        }
        const key = `${capabilityId}\0${errorCode ?? ""}`;
        const previous = keys.get(key);
        if (previous) {
            throw new Error(
                `Coverage exemption ${JSON.stringify(key)} is declared by both ${previous} and ${fragment.source}`,
            );
        }
        keys.set(key, fragment.source);
    }
    return fragments.sort((left, right) => compareOrdinal(exemptionKey(left), exemptionKey(right)));
}

function exemptionKey(fragment: JsonSourceRecord): string {
    return `${sourceId(fragment, "capabilityId")}\0${String(fragment.value.errorCode ?? "")}`;
}
