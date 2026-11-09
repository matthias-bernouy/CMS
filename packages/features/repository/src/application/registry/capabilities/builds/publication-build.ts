import { defineCapability } from "../define";
import { publicationAbortInputSchema, publicationCommitOutputSchema } from "../../schemas/publications/uploads";
import { publicationCommitErrors as errors } from "../../schemas/errors";

export const publicationBuild = defineCapability({
    id: "publication-build",
    description: "Build and publish one durable staged collection from its exact editable sources.",
    access: "authenticated",
    behavior: { effect: "command", execution: "operation", idempotency: "keyed", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/v1/uploads/build",
            input: { body: true },
            response: {
                successStatuses: [202],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: publicationAbortInputSchema,
    output: publicationCommitOutputSchema,
    errors,
    authorize: async ({ services, input, context }) => {
        await services.repository.publications.authorize(input, await services.resolveRepositoryAccount(context), true);
    },
    execute: async ({ services, input, context }) =>
        services.repository.publications.build(input, await services.resolveRepositoryAccount(context), context.signal),
});
