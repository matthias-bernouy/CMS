import { defineCapability } from "cms-repository/application/registry/capabilities/define";
import {
    artifactSourceGetInputSchema,
    artifactSourceGetOutputSchema,
} from "cms-repository/application/registry/schemas/sources";
import { namespaceClaimErrors as errors } from "cms-repository/application/registry/schemas/errors";
export const artifactSourceGet = defineCapability({
    id: "artifact-source-get",
    description: "Read private immutable contract or Provider manifest sources.",
    access: "authenticated",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/v1/artifact-source-snapshots",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { REJECTED: 409, NOT_FOUND: 404, CORE_UNAVAILABLE: 503, ACTOR_UNAVAILABLE: 403 },
            },
        },
    ],
    docs: ["overview.md"],
    input: artifactSourceGetInputSchema,
    output: artifactSourceGetOutputSchema,
    errors,
    execute: async ({ services, input, context }) =>
        services.repository.sources.getArtifact(input, await services.resolveRepositoryAccount(context)),
});
