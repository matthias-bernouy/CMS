import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
    admitContractBundleJson,
    admitContractReleaseJson,
    parseContractReleaseJson,
    type AdmittedContractRelease,
} from "@bernouy/cms-repository/contracts";
import {
    assertUniqueSourceIds,
    compareOrdinal,
    readJsonSourceRecord,
    readJsonSourceTree,
    sourceId,
    type JsonSourceRecord,
} from "./jsonFragments";

/** Assemble authored contract fragments into the one immutable release artifact. */
export async function compileContractSource(directory: string): Promise<string> {
    const definition = await readJsonSourceRecord(join(directory, "definition.json"), "definition.json");
    if (Object.hasOwn(definition.value, "capabilities")) {
        throw new Error("definition.json must keep capabilities in the capabilities/ source tree");
    }
    const fragments = await readJsonSourceTree(join(directory, "capabilities"), "capabilities");
    if (!fragments?.length) {
        throw new Error("capabilities/ must contain at least one JSON capability fragment");
    }
    assertUniqueSourceIds(fragments, "id", "Capability");
    for (const fragment of fragments) {
        if (Object.hasOwn(fragment.value, "mocks")) {
            throw new Error(`${fragment.source} must keep mocks in the separate mocks/ source tree`);
        }
    }
    const mocks = await collectMocks(directory, fragments);
    const capabilities = fragments
        .slice()
        .sort((left, right) => compareOrdinal(sourceId(left, "id"), sourceId(right, "id")))
        .map((fragment) => {
            const capabilityMocks = mocks.get(sourceId(fragment, "id"));
            return capabilityMocks?.length
                ? { ...fragment.value, mocks: capabilityMocks.map((mock) => mock.value) }
                : fragment.value;
        });
    return JSON.stringify({ ...definition.value, capabilities });
}

export async function prepareContractSource(
    directory: string,
): Promise<Readonly<{ sourceJson: string; admission: AdmittedContractRelease }>> {
    const sourceJson = await compileContractSource(directory);
    const fixtureAssets = parseContractReleaseJson(sourceJson).fixtureAssets ?? [];
    const assets = await Promise.all(
        fixtureAssets.map(async ({ id }) => ({ id, bytes: await readFile(join(directory, "fixtures", id)) })),
    );
    const admission = assets.length
        ? await admitContractBundleJson(sourceJson, assets)
        : await admitContractReleaseJson(sourceJson);
    return { sourceJson, admission };
}

async function collectMocks(
    directory: string,
    capabilities: readonly JsonSourceRecord[],
): Promise<ReadonlyMap<string, readonly JsonSourceRecord[]>> {
    const fragments = await readJsonSourceTree(join(directory, "mocks"), "mocks");
    if (!fragments) {
        return new Map();
    }
    const capabilityIds = new Set(capabilities.map((fragment) => sourceId(fragment, "id")));
    const grouped = new Map<string, JsonSourceRecord[]>();
    const keys = new Map<string, string>();
    for (const fragment of fragments) {
        const capabilityId = sourceId(fragment, "capabilityId");
        const mockId = sourceId(fragment, "id");
        if (!capabilityIds.has(capabilityId)) {
            throw new Error(`${fragment.source} references unknown capability ${JSON.stringify(capabilityId)}`);
        }
        const key = `${capabilityId}\0${mockId}`;
        const previous = keys.get(key);
        if (previous) {
            throw new Error(
                `Mock ${JSON.stringify(mockId)} for ${capabilityId} is declared by both ${previous} and ${fragment.source}`,
            );
        }
        keys.set(key, fragment.source);
        const { capabilityId: _owner, ...mock } = fragment.value;
        const normalized = { source: fragment.source, value: mock };
        grouped.set(capabilityId, [...(grouped.get(capabilityId) ?? []), normalized]);
    }
    for (const mocks of grouped.values()) {
        mocks.sort((left, right) => compareOrdinal(sourceId(left, "id"), sourceId(right, "id")));
    }
    return grouped;
}
