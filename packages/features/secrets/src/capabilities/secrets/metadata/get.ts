import { defineCapability } from "secrets/capabilities/define";
import { namespaceErrors as errors } from "secrets/schemas/errors";
import { secretReferenceSchema, secretMetadataSchema } from "secrets/schemas/secrets";

export const getSecretMetadata = defineCapability({
    id: "secrets.get-metadata",
    description: "Read secret metadata without exposing its value.",
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
            path: "/secrets.get-metadata",
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
    input: secretReferenceSchema,
    output: secretMetadataSchema,
    errors,
    execute: ({ input, services }) => services.secrets.get(input.namespaceId, input.namespaceKey, input.secretId),
});
