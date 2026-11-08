import { defineCapability } from "repository/application/registry/capabilities/define";
import {
    publicationYankInputSchema,
    publicationYankOutputSchema,
} from "repository/application/registry/schemas/publications/state";
import { namespaceClaimErrors as errors } from "repository/application/registry/schemas/errors";
export const publicationYank = defineCapability({
    id: "publication-yank",
    access: "authenticated",
    description: "publication-yank",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/v1/publications/yank",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: publicationYankInputSchema,
    output: publicationYankOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.publications.yank(input, await services.resolveRepositoryAccount(context)),
});
