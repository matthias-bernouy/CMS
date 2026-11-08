import { defineCapability } from "cms-repository/application/registry/capabilities/define";
import { nullOutputSchema } from "cms-repository/application/registry/schemas/common";
import { publicationAbortInputSchema } from "cms-repository/application/registry/schemas/publications/uploads";
import { namespaceClaimErrors as errors } from "cms-repository/application/registry/schemas/errors";
export const publicationAbort = defineCapability({
    id: "publication-abort",
    description: "publication-abort",
    access: "authenticated",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/v1/uploads/abort",
            input: { body: true },
            response: {
                successStatuses: [204],
                contentTypes: [],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: publicationAbortInputSchema,
    output: nullOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.publications.abort(input, await services.resolveRepositoryAccount(context)),
});
