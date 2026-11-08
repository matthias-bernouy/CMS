import { defineCapability } from "repository/application/registry/capabilities/define";
import { sourceGetInputSchema, artifactSourceGetOutputSchema } from "repository/application/registry/schemas/sources";
import { namespaceClaimErrors as errors } from "repository/application/registry/schemas/errors";
export const sourceGet = defineCapability({
    id: "source-get",
    description: "Read private collection sources",
    access: "authenticated",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/v1/source-snapshots",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: sourceGetInputSchema,
    output: artifactSourceGetOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.sources.getCollection(input, await services.resolveRepositoryAccount(context)),
});
