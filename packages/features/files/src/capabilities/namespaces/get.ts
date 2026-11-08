import { defineCapability } from "files/capabilities/define";
import { namespaceMetadataSchema } from "files/schemas/values";
import { namespaceCredentialsSchema } from "files/schemas/namespaces";
import { credentialErrors as errors } from "files/schemas/errors";

export const getNamespace = defineCapability({
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    id: "namespace.get",
    description: "Read one namespace with a management credential.",
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/namespaces/{namespaceId}",
            input: {
                path: { namespaceId: "namespaceId" },
                headers: { "namespace-key": { property: "namespaceKey", encoding: "uri-component" } },
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
    input: namespaceCredentialsSchema,
    output: namespaceMetadataSchema,
    errors,
    execute: async ({ input, services }) => {
        const { id, name, defaultVisibility, createdAt, quota } = await services.files.getNamespace(
            input.namespaceId,
            input.namespaceKey,
        );
        return { id, name, defaultVisibility, createdAt, quota };
    },
});
