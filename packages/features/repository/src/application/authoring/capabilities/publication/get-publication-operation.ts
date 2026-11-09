import { authorizePublication } from "../../core/authority";
import { defineCapability } from "../define";
import { publicationOperationInputSchema, publicationOperationOutputSchema } from "../../schemas/operations";
import { publicationErrors as errors } from "../../schemas/errors";
export const getPublicationOperation = defineCapability({
    id: "get-publication-operation",
    description: "Read the caller's exact durable collection publication operation in this instance.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/get-publication-operation",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503, FORBIDDEN: 403 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "authoring_get_publication_operation",
                description: "Read a durable collection publication status.",
            },
        },
    ],
    docs: ["overview.md"],
    input: publicationOperationInputSchema,
    output: publicationOperationOutputSchema,
    errors: { ...errors, FORBIDDEN: errors.INVALID_INPUT },
    authorize: authorizePublication,
    execute: async ({ services, input, context }) => {
        if (!services.authoringOperations) {
            throw new Error("Authoring operation queries are unavailable");
        }
        return publicationOperationOutputSchema.parse(
            await services.authoringOperations.get(context.siteId, input, context),
        );
    },
});
