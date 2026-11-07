import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    documentationSearchInputSchema,
    documentationSearchOutputSchema,
} from "repository/application/installations/schemas/discovery/documentation.search";
import { documentationSearchErrors as errors } from "repository/application/installations/schemas/common/failures";
import { required } from "repository/application/installations/core/gateway/requirements";
export const documentationSearch = defineCapability({
    id: "documentation.search",
    description:
        "Ask a natural-language question about the selected contracts. Search their versioned documentation before unfamiliar, multi-step or ambiguous work. Results include document references for documentation.get. A lexical-only result explicitly reports degraded semantic retrieval.",
    docs: ["overview.md", "documentation.md"],
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/documentation/search",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, REVISION_CONFLICT: 409, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "installations_documentation_search",
                description:
                    "Ask a natural-language question about the selected contracts. Search their versioned documentation before unfamiliar, multi-step or ambiguous work. Results include document references for documentation.get. A lexical-only result explicitly reports degraded semantic retrieval.",
            },
        },
    ],
    input: documentationSearchInputSchema,
    output: documentationSearchOutputSchema,
    errors,
    execute: async ({ services, input }) => required(services.documentation).search(input),
});
