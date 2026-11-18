import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { installedCollectionDetail, installedCollectionRow } from "../resources/expected";
import { assertCondition, requireRecord } from "../../../../queries/types";
import type { CollectionReadState } from "../context/types";

export function assertInstalledRows(output: unknown, state: CollectionReadState) {
    const row = requireRecord(output);
    assertCondition(
        Object.keys(row).toSorted().join(",") === "items,revision" &&
            row.revision === state.revision() &&
            Array.isArray(row.items) &&
            row.items.length === state.installed.size,
        "collection-read-installed-snapshot",
    );
    const ids = new Set<string>();
    for (const raw of row.items) {
        const item = requireRecord(raw);
        const resource = state.installed.get(String(item.collectionId));
        assertCondition(resource && !ids.has(resource.id), "collection-read-installed-identity");
        ids.add(resource.id);
        assertCondition(
            canonicalizeIJson(item) === canonicalizeIJson(installedCollectionRow(resource, state.repositoryId)),
            "collection-read-installed-fields",
        );
    }
}

export function assertInstalledDetail(output: unknown, state: CollectionReadState) {
    const resource = state.installed.get(state.resources[0]!.id)!;
    const row = { ...requireRecord(output) };
    assertCondition(typeof row.configurationJson === "string", "collection-read-configuration-json");
    row.configurationJson = canonicalizeIJson(JSON.parse(row.configurationJson));
    const expected = installedCollectionDetail(resource, state.repositoryId, state.revision(), state.title());
    assertCondition(
        canonicalizeIJson(row) === canonicalizeIJson(expected),
        "collection-read-detail-fields-or-configuration",
    );
}
