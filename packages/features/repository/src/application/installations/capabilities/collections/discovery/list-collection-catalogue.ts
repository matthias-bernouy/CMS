import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    listCollectionCatalogueInputSchema,
    listCollectionCatalogueOutputSchema,
    listCollectionCatalogueErrors,
} from "repository/application/installations/schemas/collections/discovery/list-collection-catalogue";
import { required } from "repository/application/installations/core/gateway/requirements";
export const listCollectionCatalogue = defineCapability({
    "id": "list-collection-catalogue",
    "access": "admin",
    "behavior": { "effect": "query", "execution": "sync", "sensitive": true },
    "bindings": [
        {
            "id": "http",
            "transport": "http",
            "method": "QUERY",
            "path": "/collections/catalogue",
            "input": { "body": true },
            "response": {
                "successStatuses": [200],
                "contentTypes": ["application/json"],
                "errorStatuses": { "INVALID_INPUT": 422, "CORE_UNAVAILABLE": 503, "RELEASE_MISMATCH": 409 },
            },
        },
        {
            "id": "mcp",
            "transport": "mcp",
            "tool": {
                "name": "installations_list_collection_catalogue",
                "description":
                    "List one bounded page of verified collection summaries, hydrating only that page and reusing immutable evidence. Select only the latest non-yanked release of each collection in the requested channel.",
            },
        },
    ],
    "docs": ["collection-discovery.md"],
    "description":
        "List one bounded page of verified collection summaries, hydrating only that page and reusing immutable evidence. Select only the latest non-yanked release of each collection in the requested channel.",
    input: listCollectionCatalogueInputSchema,
    output: listCollectionCatalogueOutputSchema,
    errors: listCollectionCatalogueErrors,
    execute: ({ services, input, context }) =>
        required(services.sources).discovery.list(context.siteId, input, context.signal),
});
