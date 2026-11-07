import { z } from "zod";
import { defineCapability } from "cms-files/capabilities/define";
import { namespaceCredentialsSchema } from "cms-files/schemas/namespaces";
import { credentialErrors as errors } from "cms-files/schemas/errors";

export const deleteNamespace = defineCapability({
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    id: "namespace.delete",
    description: "Delete a namespace and all of its files.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "DELETE",
            path: "/namespaces/{namespaceId}",
            input: { path: { namespaceId: "namespaceId" }, body: { properties: ["namespaceKey"] } },
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
    input: namespaceCredentialsSchema,
    output: z.null(),
    errors,
    execute: async ({ input, services }) => {
        await services.files.deleteNamespace(input.namespaceId, input.namespaceKey);
        return null;
    },
});
