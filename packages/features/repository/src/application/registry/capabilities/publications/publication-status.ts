import { defineCapability } from "repository/application/registry/capabilities/define";
import {
    publicationAbortInputSchema,
    publicationBeginOutputSchema,
} from "repository/application/registry/schemas/publications/uploads";
import { namespaceClaimErrors as errors } from "repository/application/registry/schemas/errors";
export const publicationStatus = defineCapability({
    id: "publication-status",
    description: "publication-status",
    access: "authenticated",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/v1/uploads/status",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: publicationAbortInputSchema,
    output: publicationBeginOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.publications.status(input, await services.resolveRepositoryAccount(context)),
});
