import { defineCapability } from "repository/application/authoring/capabilities/define";
import {
    getProviderManifestSourcesInputSchema,
    sourceSnapshotSchema,
} from "repository/application/authoring/schemas/sources";
import { authoringErrors as errors } from "repository/application/authoring/schemas/errors";
import { requiredText } from "repository/application/authoring/core/input";
export const getProviderManifestSources = defineCapability({
    id: "get-provider-manifest-sources",
    description: "Read private provider-manifest sources owned by the connected Repository account.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/get-provider-manifest-sources",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "authoring_get_provider_manifest_sources",
                description: "Read private provider-manifest sources owned by the connected Repository account.",
            },
        },
    ],
    docs: ["overview.md", "artifact-authoring.md", "provider-manifest-source.md"],
    input: getProviderManifestSourcesInputSchema,
    output: sourceSnapshotSchema,
    errors,
    execute: ({ services, input }) =>
        services.authoring.artifactSources(
            "provider-manifest",
            requiredText(input.namespace),
            requiredText(input.providerId),
            requiredText(input.version),
        ),
});
