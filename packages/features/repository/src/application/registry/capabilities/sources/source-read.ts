import { defineCapability } from "repository/application/registry/capabilities/define";
import { sourceReadInputSchema, sourceReadOutputSchema } from "repository/application/registry/schemas/sources";
import { namespaceClaimErrors as errors } from "repository/application/registry/schemas/errors";

export const sourceRead = defineCapability({
    id: "source-read",
    description: "Read a private immutable source snapshot up to 8 MiB, for any artifact kind.",
    access: "authenticated",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/v1/source-snapshots/read",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: sourceReadInputSchema,
    output: sourceReadOutputSchema,
    errors,
    execute: async ({ services, input, context }) => {
        const account = await services.resolveRepositoryAccount(context);
        const { kind, id, ...scope } = input;
        return kind === "collection"
            ? services.repository.sources.getCollection({ ...scope, collectionId: id }, account)
            : services.repository.sources.getArtifact({ ...scope, id, kind }, account);
    },
});
