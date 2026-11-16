import { defineCapability } from "repository/application/registry/capabilities/define";
import {
    recipeCatalogueInputSchema,
    recipeCatalogueOutputSchema,
} from "repository/application/registry/schemas/catalogue/recipes";
import { assetDownloadErrors } from "repository/application/registry/schemas/errors";

export const bootstrapRecipes = defineCapability({
    id: "bootstrap-recipes",
    description:
        "Browse indexed bootstrap summaries from the latest non-yanked stable release of each collection. Discovery does not approve installation.",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/v1/recipes",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["bootstrap-recipes.md"],
    input: recipeCatalogueInputSchema,
    output: recipeCatalogueOutputSchema,
    errors: assetDownloadErrors,
    execute: ({ services, input, context }) => services.repository.reads.recipes(input, context.signal),
});
