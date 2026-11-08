import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    repositorySearchInputSchema,
    repositorySearchOutputSchema,
} from "repository/application/installations/schemas/discovery/repository.search";
import { repositoryGetErrors as errors } from "repository/application/installations/schemas/common/failures";
import { required } from "repository/application/installations/core/requirements";
export const repositorySearch = defineCapability({
    id: "repository.search",
    description:
        "Find reusable collections, Blocs, contracts and Provider manifests in configured repositories before installing or creating resources. Inspect exact results with repository.get. Metadata does not prove compatibility or a running Provider. Partial sources and lexical fallback are explicit.",
    docs: ["repository-discovery.md"],
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/repository/search",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_FOUND: 404,
                    RELEASE_MISMATCH: 409,
                    REVISION_CONFLICT: 409,
                    CATALOGUE_TOO_LARGE: 422,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_repository_search",
                description:
                    "Find reusable collections, Blocs, contracts and Provider manifests in configured repositories before installing or creating resources. Inspect exact results with repository.get. Metadata does not prove compatibility or a running Provider. Partial sources and lexical fallback are explicit.",
            },
        },
    ],
    input: repositorySearchInputSchema,
    output: repositorySearchOutputSchema,
    errors,
    execute: async ({ services, input }) => required(services.discovery).search(input),
});
