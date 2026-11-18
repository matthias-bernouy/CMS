import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { compareSemVer } from "@bernouy/ulvia-contracts/compatibility";
import { collectionMetadata } from "../resources/expected";
import { assertCondition, requireRecord } from "../../../../queries/types";
import type { CollectionReadResource } from "../resources/collection";
import type { CollectionReadState } from "../context/types";

export function collectionRows(state: CollectionReadState, history: boolean) {
    const rows = history
        ? state.resources.filter((row) => row.id === state.resources[0]!.id)
        : state.registry.resources;
    let selected = rows;
    if (!history) {
        const latest = new Map<string, CollectionReadResource>();
        for (const row of rows) {
            const previous = latest.get(row.id);
            if (!previous || compareSemVer(row.version, previous.version) > 0) {
                latest.set(row.id, row);
            }
        }
        selected = [...latest.values()];
    }
    return selected.toSorted((a, b) =>
        a.namespace < b.namespace
            ? -1
            : a.namespace > b.namespace
              ? 1
              : a.id < b.id
                ? -1
                : a.id > b.id
                  ? 1
                  : compareSemVer(a.version, b.version),
    );
}

export function collectionAction(state: CollectionReadState, resource: CollectionReadResource) {
    const installed = state.installed.get(resource.id);
    return !installed
        ? "install"
        : resource.digest === installed.digest
          ? "current"
          : compareSemVer(resource.version, installed.version) > 0
            ? "upgrade"
            : "older";
}

export function collectionRow(state: CollectionReadState, resource: CollectionReadResource, includeInstalled: boolean) {
    const installed = state.installed.get(resource.id);
    return {
        ...collectionMetadata(resource, state.repositoryId),
        action: collectionAction(state, resource),
        ...(includeInstalled && installed ? { installedVersion: installed.version } : {}),
    };
}

export function assertCollectionPage(
    output: unknown,
    state: CollectionReadState,
    history: boolean,
    offset: number,
    limit: number,
) {
    const value = requireRecord(output);
    const rows = collectionRows(state, history);
    const expected = rows.slice(offset, offset + limit).map((resource) => collectionRow(state, resource, !history));
    assertCondition(
        value.revision === state.revision() &&
            value.channel === "stable" &&
            canonicalizeIJson(value.releases) === canonicalizeIJson(expected),
        "collection-read-page-fields-or-freshness",
    );
    assertCondition(
        typeof value.nextCursor === "string" && value.nextCursor.length > 0 === offset + limit < rows.length,
        "collection-read-page-exhaustion",
    );
    const expectedKeys = history
        ? "channel,collectionId,nextCursor,publisherId,releases,repositoryId,revision"
        : "channel,nextCursor,releases,revision";
    assertCondition(Object.keys(value).toSorted().join(",") === expectedKeys, "collection-read-page-public-shape");
    if (history) {
        assertCondition(
            value.repositoryId === state.repositoryId &&
                value.publisherId === state.namespace &&
                value.collectionId === state.resources[0]!.id,
            "collection-read-history-scope",
        );
    }
}

export function assertReleaseReview(output: unknown, state: CollectionReadState, resource: CollectionReadResource) {
    assertCondition(
        canonicalizeIJson(output) === canonicalizeIJson(collectionRow(state, resource, false)),
        "collection-read-release-action-or-metadata",
    );
}
