import { defineCapability } from "cms-repository/application/registry/capabilities/define";
import {
    catalogueSearchInputSchema,
    catalogueSearchOutputSchema,
} from "cms-repository/application/registry/schemas/search";
import { catalogueSearchErrors as errors } from "cms-repository/application/registry/schemas/errors";
export const catalogueSearch = defineCapability({
    id: "catalogue-search",
    description:
        "Search public collection, Bloc, contract and Provider metadata before installation. Results are discovery hints, not compatibility or runtime readiness claims.",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/v1/search",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    REJECTED: 409,
                    INVALID_INPUT: 422,
                    NOT_FOUND: 404,
                    RELEASE_MISMATCH: 409,
                    REVISION_CONFLICT: 409,
                    CATALOGUE_TOO_LARGE: 422,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: catalogueSearchInputSchema,
    output: catalogueSearchOutputSchema,
    errors,
    execute: ({ services, input }) => services.repository.reads.search(input),
});
