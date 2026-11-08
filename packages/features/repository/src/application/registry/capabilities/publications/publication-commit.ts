import { defineCapability } from "repository/application/registry/capabilities/define";
import {
    publicationAbortInputSchema,
    publicationCommitOutputSchema,
} from "repository/application/registry/schemas/publications/uploads";
import { publicationCommitErrors as errors } from "repository/application/registry/schemas/errors";
export const publicationCommit = defineCapability({
    id: "publication-commit",
    description: "Publish one complete staged immutable artifact. Exact retries reconcile the receipt.",
    access: "authenticated",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/v1/uploads/commit",
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
    output: publicationCommitOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.publications.commit(input, await services.resolveRepositoryAccount(context)),
});
