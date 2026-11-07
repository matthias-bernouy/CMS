import { defineCapability } from "cms-files/capabilities/define";
import { fileCall } from "cms-files/capabilities/support";
import { boundedText } from "cms-files/core/validation";
import { createWorkspaceUploadInputSchema, createWorkspaceUploadOutputSchema } from "cms-files/schemas/workspace";
import { createWorkspaceUploadErrors as errors } from "cms-files/schemas/errors";

export const createWorkspaceUpload = defineCapability({
    id: "workspace.upload.create",
    description: "Create an upload session in the server-managed site workspace.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/workspace.upload.create",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_FOUND: 404,
                    CORE_UNAVAILABLE: 503,
                    QUOTA_EXCEEDED: 409,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "files_workspace_upload_create",
                description:
                    "Start a file upload in this instance. Send the raw bytes to the returned uploadUrl with the MCP bearer and Upload-Token, then complete the upload.",
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: createWorkspaceUploadInputSchema,
    output: createWorkspaceUploadOutputSchema,
    errors,
    execute: ({ input, services, fail }) =>
        fileCall(errors, fail, () =>
            services.workspace.createUpload({
                ...input,
                contentType: typeof input.contentType === "string" ? boundedText(input.contentType, 255) : undefined,
                imageProfile: input.imageProfile ?? undefined,
                fileId: typeof input.fileId === "string" ? boundedText(input.fileId, 128) : undefined,
            }),
        ),
});
