import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { compareSemVer } from "@bernouy/ulvia-contracts/compatibility";
import { collectionPin } from "../resources/expected";
import { collectionRow } from "./metadata";
import { assertCondition, requireRecord } from "../../../../queries/types";
import type { CollectionReadState } from "../context/types";

export function assertAvailableCollections(output: unknown, state: CollectionReadState) {
    const value = requireRecord(output);
    assertCondition(
        Object.keys(value).toSorted().join(",") === "installed,releases,repositories,revision" &&
            value.revision === state.revision() &&
            canonicalizeIJson(value.repositories) === canonicalizeIJson([state.repositoryId]),
        "collection-read-available-scope",
    );
    const expected = state.registry.resources
        .toSorted((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : compareSemVer(a.version, b.version)))
        .map((resource) => collectionRow(state, resource, false));
    assertCondition(
        canonicalizeIJson(value.releases) === canonicalizeIJson(expected),
        "collection-read-available-all-authored-versions",
    );
    assertCondition(
        Array.isArray(value.installed) && value.installed.length === state.installed.size,
        "collection-read-available-installed-count",
    );
    const seen = new Set<string>();
    for (const raw of value.installed) {
        const item = requireRecord(raw);
        const resource = state.installed.get(String(item.collectionId));
        assertCondition(resource && !seen.has(resource.id), "collection-read-available-installed-identity");
        seen.add(resource.id);
        assertCondition(
            canonicalizeIJson(item) ===
                canonicalizeIJson({ ...collectionPin(resource, state.repositoryId), configurable: true }),
            "collection-read-available-installed-fields",
        );
    }
}
