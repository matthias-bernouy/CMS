import { defineCapability } from "repository/application/authoring/capabilities/define";
import {
    publishInputSchema,
    publishCollectionOutputSchema,
} from "repository/application/authoring/schemas/publication";
import { publicationErrors as errors } from "repository/application/authoring/schemas/errors";
import { requiredText } from "repository/application/authoring/core/input";
export const publishCollection = defineCapability({
    id: "publish-collection",
    description:
        "Publish the exact prepared collection digest and retain its private sources in the Repository. This does not install the release on the site.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/publish-collection",
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
                name: "authoring_publish_collection",
                description:
                    "Publish the exact prepared collection digest and retain its private sources in the Repository. This does not install the release on the site.",
            },
        },
    ],
    docs: ["overview.md", "collection-authoring.md"],
    input: publishInputSchema,
    output: publishCollectionOutputSchema,
    errors,
    execute: ({ services, input }) =>
        services.authoring.publish(requiredText(input.preparationId), requiredText(input.expectedDigest)),
});
