import { authorizePublication } from "../../core/authority";
import { defineCapability } from "repository/application/authoring/capabilities/define";
import {
    publishInputSchema,
    publishCollectionOutputSchema,
} from "repository/application/authoring/schemas/publication";
import { publicationErrors as errors } from "repository/application/authoring/schemas/errors";
import { requiredText } from "repository/application/authoring/core/input";
export const publishCollectionOperation = defineCapability({
    id: "publish-collection-operation",
    description:
        "Publish the exact prepared collection digest and retain its private sources in the Repository. This does not install the release on the site.",
    access: "admin",
    behavior: { effect: "command", execution: "operation", idempotency: "keyed", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/publish-collection-operation",
            input: { body: true },
            response: {
                successStatuses: [202],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503, FORBIDDEN: 403 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "authoring_publish_collection_operation",
                description:
                    "Publish the exact prepared collection digest and retain its private sources in the Repository. This does not install the release on the site.",
            },
        },
    ],
    docs: ["overview.md", "collection-authoring.md"],
    input: publishInputSchema,
    output: publishCollectionOutputSchema,
    errors: { ...errors, FORBIDDEN: errors.INVALID_INPUT },
    authorize: authorizePublication,
    execute: ({ services, input }) =>
        services.authoring.publish(requiredText(input.preparationId), requiredText(input.expectedDigest)),
});
