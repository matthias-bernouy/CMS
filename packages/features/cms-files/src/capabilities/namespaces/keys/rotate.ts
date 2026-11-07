import { defineCapability } from "cms-files/capabilities/define";
import { fileCall } from "cms-files/capabilities/support";
import { namespaceKeyTargetSchema, createNamespaceKeyOutputSchema } from "cms-files/schemas/namespaces";
import { credentialErrors as errors } from "cms-files/schemas/errors";

export const rotateNamespaceKey = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "namespace.keys.rotate",
    description: "Replace and revoke one namespace credential.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/namespaces/{namespaceId}/keys/{keyId}/rotate",
            input: {
                path: { namespaceId: "namespaceId", keyId: "keyId" },
                body: { properties: ["namespaceKey"] },
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
    docs: ["overview.md", "site-files.md"],
    input: namespaceKeyTargetSchema,
    output: createNamespaceKeyOutputSchema,
    errors,
    execute: ({ input, services, fail }) =>
        fileCall(errors, fail, () =>
            services.files.rotateNamespaceKey(input.namespaceId, input.namespaceKey, input.keyId),
        ),
});
