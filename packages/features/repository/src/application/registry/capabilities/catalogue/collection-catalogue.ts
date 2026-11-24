import { defineCapability } from "repository/application/registry/capabilities/define";
import {
    collectionCatalogueInputSchema,
    catalogueListOutputSchema,
    assetDownloadErrors,
} from "repository/application/registry/schemas/catalogue/collection-catalogue";
export const collectionCatalogue = defineCapability({
    "id": "collection-catalogue",
    "description":
        "List one latest non-yanked release per collection and channel, with bounded pagination. Metadata is a discovery hint, not installation approval.",
    "access": "public",
    "behavior": { "effect": "query", "execution": "sync", "sensitive": false },
    "bindings": [
        {
            "id": "http",
            "transport": "http",
            "method": "QUERY",
            "path": "/v1/collections",
            "input": { "body": true },
            "response": {
                "successStatuses": [200],
                "contentTypes": ["application/json"],
                "errorStatuses": { "REJECTED": 409, "NOT_FOUND": 404, "CORE_UNAVAILABLE": 503 },
            },
        },
    ],
    "docs": ["overview.md"],
    input: collectionCatalogueInputSchema,
    output: catalogueListOutputSchema,
    errors: assetDownloadErrors,
    execute: async ({ services, input, context }) => {
        const result = await services.repository.reads.collectionCatalogue(input, context.signal);
        return {
            ...result,
            releases: result.releases.map((entry) => {
                if (entry.kind !== "collection") {
                    throw new Error("Collection catalogue returned a different artifact kind");
                }
                return { ...entry, kind: "collection" as const };
            }),
        };
    },
});
