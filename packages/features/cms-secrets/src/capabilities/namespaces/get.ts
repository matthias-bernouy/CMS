import { defineCapability } from "cms-secrets/capabilities/define";
import { secretCall } from "cms-secrets/capabilities/support";
import { namespaceErrors as errors } from "cms-secrets/schemas/errors";
import { namespaceCredentialsSchema } from "cms-secrets/schemas/fields";
import { namespaceMetadataSchema } from "cms-secrets/schemas/namespaces";

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
    execute: ({ input, services, fail }) =>
        secretCall(errors, fail, async () => {
            const result = await services.secrets.getNamespace(input.namespaceId, input.namespaceKey);
            return { ...result, createdAt: result.createdAt.toISOString() };
        }),
});
