import { defineCapability } from "repository/application/registry/capabilities/define";
import {
    publicationStateInputSchema,
    publicationYankOutputSchema,
} from "repository/application/registry/schemas/publications/state";
import { assetDownloadErrors as errors } from "repository/application/registry/schemas/errors";
export const publicationState = defineCapability({
    id: "publication-state",
    access: "public",
    description: "publication-state",
    behavior: { effect: "query", execution: "sync", sensitive: false },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/v1/publications/state",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: publicationStateInputSchema,
    output: publicationYankOutputSchema,
    errors,
    execute: ({ services, input }) => services.repository.reads.publicationState(input),
});
