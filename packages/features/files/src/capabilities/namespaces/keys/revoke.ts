import { z } from "zod";
import { defineCapability } from "files/capabilities/define";
import { namespaceKeyTargetSchema } from "files/schemas/namespaces";
import { credentialErrors as errors } from "files/schemas/errors";

export const revokeNamespaceKey = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "namespace.keys.revoke",
    description: "Revoke one namespace credential.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "DELETE",
            path: "/namespaces/{namespaceId}/keys/{keyId}",
            input: {
                path: { namespaceId: "namespaceId", keyId: "keyId" },
                body: { properties: ["namespaceKey"] },
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
    docs: ["overview.md", "site-files.md"],
    input: namespaceKeyTargetSchema,
    output: z.null(),
    errors,
    execute: async ({ input, services }) => {
        await services.files.revokeNamespaceKey(input.namespaceId, input.namespaceKey, input.keyId);
        return null;
    },
});
