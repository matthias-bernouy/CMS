import { defineCapability } from "cms-repository/application/authoring/capabilities/define";
import {
    publishInputSchema,
    publishProviderManifestOutputSchema,
} from "cms-repository/application/authoring/schemas/publication";
import { publicationErrors as errors } from "cms-repository/application/authoring/schemas/errors";
import { requiredText } from "cms-repository/application/authoring/core/input";
export const publishProviderManifest = defineCapability({
    id: "publish-provider-manifest",
    description:
        "Publish the exact prepared provider-manifest digest and retain its private sources. This does not install or deploy it.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/publish-provider-manifest",
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
                name: "authoring_publish_provider_manifest",
                description:
                    "Publish the exact prepared provider-manifest digest and retain its private sources. This does not install or deploy it.",
            },
        },
    ],
    docs: ["overview.md", "artifact-authoring.md", "provider-manifest-source.md"],
    input: publishInputSchema,
    output: publishProviderManifestOutputSchema,
    errors,
    execute: ({ services, input }) =>
        services.authoring.publishArtifact(
            "provider-manifest",
            requiredText(input.preparationId),
            requiredText(input.expectedDigest),
        ),
});
