import { assertCondition } from "./types";
import type { QueryCase } from "./types";

export const installationQueries: readonly QueryCase[] = [
    {
        family: "installations",
        capability: "capabilities.describe",
        input: () => ({ contractId: "ulvia/cms.content" }),
        assert: (out) =>
            assertCondition(out.found === true && Array.isArray(out.capabilities) && out.capabilities.length > 0),
    },
    {
        family: "installations",
        capability: "get-site-upgrade-status",
        assert: (out) => assertCondition(out.maintenance === false),
    },
    {
        family: "installations",
        capability: "initialization.entry",
        assert: (out) => assertCondition(out.pending === false),
    },
    {
        family: "installations",
        capability: "initialization.status",
        assert: (out) => assertCondition(out.status === "completed"),
    },
    {
        family: "installations",
        capability: "initialization.repository.get",
        assert: (out) => assertCondition(out.configured === true),
    },
    {
        family: "installations",
        capability: "list-available-providers",
        assert: (out) => assertCondition(Array.isArray(out.items) && out.items.length > 0),
    },
    {
        family: "installations",
        capability: "list-provider-installations",
        assert: (out) => assertCondition(Array.isArray(out.installations) && out.installations.length > 0),
    },
    {
        family: "installations",
        capability: "list-available-collections",
        assert: (out) => assertCondition(Array.isArray(out.releases) && out.releases.length > 0),
    },
    {
        family: "installations",
        capability: "list-collection-catalogue",
        input: () => ({ limit: 25 }),
        assert: (out) => assertCondition(Array.isArray(out.releases) && out.releases.length > 0),
    },
    ...["list-collection-installations", "list-installed-collections"].map(
        (capability): QueryCase => ({
            family: "installations",
            capability,
            assert: (out) => assertCondition(Array.isArray(out.items) && out.items.length > 0),
        }),
    ),
    ...["get-collection-details", "get-collection-installation"].map(
        (capability): QueryCase => ({
            family: "installations",
            capability,
            input: ({ collectionId }) => ({ collectionId }),
            assert: (out, context) =>
                assertCondition(out.collectionId === context.collectionId && typeof out.digest === "string"),
        }),
    ),
    {
        family: "installations",
        capability: "list-operations",
        input: () => ({ limit: 25 }),
        assert: (out) => assertCondition(Array.isArray(out.items)),
    },
    {
        family: "installations",
        capability: "list-site-usage",
        input: () => ({ limit: 25 }),
        assert: (out) => assertCondition(out.complete === true && Array.isArray(out.references)),
    },
    {
        family: "installations",
        capability: "documentation.search",
        input: () => ({ query: "page", limit: 10 }),
        assert: (out) => assertCondition(Array.isArray(out.results) && out.results.length > 0),
    },
    {
        family: "installations",
        capability: "repository.search",
        input: () => ({ query: "smoke", limit: 10 }),
        assert: (out) => assertCondition(Array.isArray(out.results) && out.results.length > 0),
    },
];
