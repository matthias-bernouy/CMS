import { defineCapability } from "cms-secrets/capabilities/define";
import { namedSecretErrors as errors } from "cms-secrets/schemas/errors";
import { secretNameInputSchema, secretMetadataSchema } from "cms-secrets/schemas/secrets";

export const getSecretMetadataByName = defineCapability({
    id: "secrets.get-metadata-by-name",
    description: "Read secret metadata by its namespace-local name without exposing its value.",
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
            path: "/secrets.get-metadata-by-name",
            input: {
                body: true,
            },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_AUTHORIZED: 403,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: secretNameInputSchema,
    output: secretMetadataSchema.nullable(),
    errors,
    execute: ({ input, services }) => services.secrets.getByName(input.namespaceId, input.namespaceKey, input.name),
});
