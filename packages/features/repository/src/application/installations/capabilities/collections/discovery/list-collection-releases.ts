import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    listCollectionReleasesInputSchema,
    listCollectionReleasesOutputSchema,
    listCollectionReleasesErrors,
} from "repository/application/installations/schemas/collections/discovery/list-collection-releases";
import { required } from "repository/application/installations/core/gateway/requirements";
export const listCollectionReleases = defineCapability({
    "id": "list-collection-releases",
    "access": "admin",
    "behavior": { "effect": "query", "execution": "sync", "sensitive": true },
    "bindings": [
        {
            "id": "http",
            "transport": "http",
            "method": "QUERY",
            "path": "/collections/releases",
            "input": { "body": true },
            "response": {
                "successStatuses": [200],
                "contentTypes": ["application/json"],
                "errorStatuses": {
                    "INVALID_INPUT": 422,
                    "CORE_UNAVAILABLE": 503,
                    "NOT_FOUND": 404,
                    "RELEASE_MISMATCH": 409,
                },
            },
        },
        {
            "id": "mcp",
            "transport": "mcp",
            "tool": {
                "name": "installations_list_collection_releases",
                "description":
                    "List one bounded page of verified collection summaries, hydrating only that page and reusing immutable evidence. Scope release history to one Repository and collection.",
            },
        },
    ],
    "docs": ["collection-discovery.md"],
    "description":
        "List one bounded page of verified collection summaries, hydrating only that page and reusing immutable evidence. Scope release history to one Repository and collection.",
    input: listCollectionReleasesInputSchema,
    output: listCollectionReleasesOutputSchema,
    errors: listCollectionReleasesErrors,
    execute: ({ services, input, context }) =>
        required(services.sources).discovery.history(context.siteId, input, context.signal),
});
