import { z } from "zod";
import { defineCapability } from "secrets/capabilities/define";
import { namespaceErrors as errors } from "secrets/schemas/errors";
import { namespaceKeyInputSchema } from "secrets/schemas/keys";

export const revokeNamespaceKey = defineCapability({
    id: "namespace.keys.revoke",
    description: "Revoke one secret namespace credential.",
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
            path: "/namespaces/{namespaceId}/keys/{keyId}",
            input: {
                path: {
                    namespaceId: "namespaceId",
                    keyId: "keyId",
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
    input: namespaceKeyInputSchema,
    output: z.null(),
    errors,
    execute: async ({ input, services }) => {
        await services.secrets.revokeNamespaceKey(input.namespaceId, input.namespaceKey, input.keyId);
        return null;
    },
});
