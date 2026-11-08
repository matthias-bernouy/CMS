import { defineCapability } from "repository/application/registry/capabilities/define";
import {
    publicationCheckCollectionInputSchema,
    publicationCheckCollectionOutputSchema,
} from "repository/application/registry/schemas/publications/state";
import { publicationCheckCollectionErrors as errors } from "repository/application/registry/schemas/errors";
export const publicationCheckCollection = defineCapability({
    id: "publication-check-collection",
    access: "authenticated",
    description:
        "Check collection publication evolution against authoritative history, including yanked versions. This does not publish or install resources.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/v1/publications/check-collection",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: publicationCheckCollectionInputSchema,
    output: publicationCheckCollectionOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.publications.checkCollection(input, await services.resolveRepositoryAccount(context)),
});
