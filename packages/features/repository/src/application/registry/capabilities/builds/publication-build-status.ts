import { defineCapability } from "../define";
import {
    publicationBuildStatusInputSchema,
    publicationBuildStatusOutputSchema,
} from "../../schemas/publications/builds";
import { publicationCommitErrors as errors } from "../../schemas/errors";

export const publicationBuildStatus = defineCapability({
    id: "publication-build-status",
    access: "authenticated",
    description: "Read one account-, namespace- and instance-bound publication build operation.",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/v1/uploads/build-status",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: publicationBuildStatusInputSchema,
    output: publicationBuildStatusOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        await services.repository.publications.authorize(input, await services.resolveRepositoryAccount(context));
        if (!services.repositoryOperations) {
            throw new Error("Repository operation queries are unavailable");
        }
        return publicationBuildStatusOutputSchema.parse(
            await services.repositoryOperations.get(context.siteId, input, context),
        );
    },
});
