import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { CollectionReadResource } from "../collections/resources/collection";
import type { CollectionReadState } from "../collections/context/types";

export function resourceReference(resource: CollectionReadResource) {
    return {
        kind: "collection",
        publisherId: resource.namespace,
        id: resource.id,
        version: resource.version,
        digest: resource.digest,
    };
}

export function expectedSearch(state: CollectionReadState) {
    const latest = new Map(state.resources.map((resource) => [resource.id, resource]));
    return new Map(
        [...latest.values()].map((resource) => [
            resource.id,
            {
                reference: resourceReference(resource),
                name: resource.name,
                description: resource.description,
                categories: [],
                contractIds: [],
                repositoryId: state.repositoryId,
            },
        ]),
    );
}

export function searchPageOracle(expected: ReturnType<typeof expectedSearch>, limit: number) {
    return (value: unknown) => {
        const row = requireRecord(value);
        assertCondition(
            (row.mode === "lexical" || row.mode === "hybrid") && row.degraded === (row.mode === "lexical"),
            "site-discovery-valid-search-mode",
        );
        assertCondition(
            row.partial === false &&
                Array.isArray(row.unavailableRepositories) &&
                row.unavailableRepositories.length === 0,
            "site-discovery-local-source-complete",
        );
        assertCondition(
            Array.isArray(row.results) && row.results.length > 0 && row.results.length <= limit,
            "site-discovery-nonempty-bounded-page",
        );
        const seen = new Set<string>();
        for (const raw of row.results) {
            const result = requireRecord(raw);
            const reference = requireRecord(result.reference);
            const id = String(reference.id);
            assertCondition(
                expected.has(id) && !seen.has(id) && canonicalizeIJson(result) === canonicalizeIJson(expected.get(id)),
                "site-discovery-stale-private-or-duplicate-result",
            );
            seen.add(id);
        }
        assertCondition(
            row.nextCursor === undefined ||
                (typeof row.nextCursor === "string" && row.nextCursor.length > 0 && row.nextCursor.length <= 8192),
            "site-discovery-cursor-bound",
        );
    };
}

export function expectedResourceContent(resource: CollectionReadResource) {
    const release = resource.release;
    return JSON.stringify(
        {
            ...release,
            blocs: release.blocs.map((bloc) => ({
                id: bloc.id,
                label: bloc.label,
                description: bloc.description,
                categories: bloc.categories,
                catalogue: bloc.catalogue ?? "listed",
                defaultExample: bloc.defaultExample,
                requires: bloc.requires,
            })),
        },
        null,
        2,
    );
}
