import { defineCapability } from "secrets/capabilities/define";
import { namespaceErrors as errors } from "secrets/schemas/errors";
import { namespaceCredentialsSchema } from "secrets/schemas/fields";
import { namespaceMetadataSchema } from "secrets/schemas/namespaces";

export const getNamespace = defineCapability({
    id: "namespace.get",
    description: "Read one secret namespace with a management credential.",
    access: "admin",
    behavior: {
        effect: "query",
        execution: "sync",
        sensitive: true,
    },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/namespace.get",
            input: {
                body: true,
            },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_AUTHORIZED: 403,
                    NOT_FOUND: 404,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: namespaceCredentialsSchema,
    output: namespaceMetadataSchema,
    errors,
    execute: async ({ input, services }) => {
        const result = await services.secrets.getNamespace(input.namespaceId, input.namespaceKey);
        return { ...result, createdAt: result.createdAt.toISOString() };
    },
});
