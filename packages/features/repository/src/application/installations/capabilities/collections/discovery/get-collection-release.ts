import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    getCollectionReleaseInputSchema,
    getCollectionReleaseOutputSchema,
    getCollectionReleaseErrors,
} from "repository/application/installations/schemas/collections/discovery/get-collection-release";
import { required } from "repository/application/installations/core/gateway/requirements";
export const getCollectionRelease = defineCapability({
    "id": "get-collection-release",
    "access": "admin",
    "behavior": { "effect": "query", "execution": "sync", "sensitive": true },
    "bindings": [
        {
            "id": "http",
            "transport": "http",
            "method": "QUERY",
            "path": "/collections/release",
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
                "name": "installations_get_collection_release",
                "description":
                    "Verify one exact release and return its browser-authority review. Does not install or grant execution.",
            },
        },
    ],
    "docs": ["collection-discovery.md"],
    "description":
        "Verify one exact release and return its browser-authority review. Does not install or grant execution.",
    input: getCollectionReleaseInputSchema,
    output: getCollectionReleaseOutputSchema,
    errors: getCollectionReleaseErrors,
    execute: ({ services, input, context }) =>
        required(services.sources).discovery.review(context.siteId, input, context.signal),
});
