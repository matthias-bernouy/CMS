import { assertCondition } from "./types";
import type { QueryCase } from "./types";

export const repositoryQueries: readonly QueryCase[] = [
    {
        family: "repository",
        capability: "repository-info",
        site: "registry",
        assert: (out) => assertCondition(Object.keys(out).length > 0),
    },
    {
        family: "repository",
        capability: "catalogue-list",
        site: "registry",
        input: () => ({ kind: "contract", limit: 25 }),
        assert: (out) => assertCondition(Object.values(out).some((value) => Array.isArray(value) && value.length > 0)),
    },
    {
        family: "repository",
        capability: "catalogue-search",
        site: "registry",
        input: () => ({ query: "smoke", limit: 10 }),
        assert: (out) => assertCondition(Array.isArray(out.results) && out.results.length > 0),
    },
    {
        family: "repository",
        capability: "collection-catalogue",
        site: "registry",
        input: () => ({ limit: 25 }),
        assert: (out) => assertCondition(Object.values(out).some((value) => Array.isArray(value) && value.length > 0)),
    },
    {
        family: "repository",
        capability: "namespace-list",
        site: "registry",
        assert: (out) => assertCondition(Object.values(out).some((value) => Array.isArray(value) && value.length > 0)),
    },
    {
        family: "repository",
        capability: "namespace-get",
        site: "registry",
        input: () => ({ namespace: "ulvia.test" }),
        assert: (out) => assertCondition(Object.keys(out).length > 0),
    },
    {
        family: "repository",
        capability: "bootstrap-recipes",
        site: "registry",
        input: () => ({ limit: 25 }),
        assert: (out) => assertCondition(Array.isArray(out.items)),
    },
    {
        family: "repository",
        capability: "publication-state",
        site: "registry",
        input: ({ collectionId }) => ({
            kind: "collection",
            publisherId: "ulvia.test",
            id: collectionId,
            version: "1.0.0",
        }),
        assert: (out) => assertCondition(Object.keys(out).length > 0),
    },
];
