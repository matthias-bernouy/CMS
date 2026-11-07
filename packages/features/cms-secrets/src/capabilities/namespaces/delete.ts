import { z } from "zod";
import { defineCapability } from "cms-secrets/capabilities/define";
import { namespaceErrors as errors } from "cms-secrets/schemas/errors";
import { namespaceCredentialsSchema } from "cms-secrets/schemas/fields";

export const deleteNamespace = defineCapability({
    id: "namespace.delete",
    description: "Delete a secret namespace and all encrypted values it owns.",
    access: "admin",
    behavior: {
        effect: "command",
        idempotency: "none",
        execution: "sync",
        sensitive: true,
    },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "DELETE",
            path: "/namespaces/{namespaceId}",
            input: {
                path: {
                    namespaceId: "namespaceId",
                },
                body: {
                    properties: ["namespaceKey"],
                },
            },
            response: {
                successStatuses: [204],
                contentTypes: [],
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
    output: z.null(),
    errors,
    execute: async ({ input, services }) => {
        await services.secrets.deleteNamespace(input.namespaceId, input.namespaceKey);
        return null;
    },
});
