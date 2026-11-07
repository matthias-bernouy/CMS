import { z } from "zod";
import { defineCapability } from "cms-files/capabilities/define";
import { completeWorkspaceUploadInputSchema } from "cms-files/schemas/workspace";
import { completeWorkspaceUploadErrors as errors } from "cms-files/schemas/errors";

export const completeWorkspaceUpload = defineCapability({
    id: "workspace.upload.complete",
    description: "Complete an upload in the server-managed site workspace.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/workspace.upload.complete",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_FOUND: 404,
                    UPLOAD_NOT_READY: 409,
                    QUOTA_EXCEEDED: 409,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "files_workspace_upload_complete",
                description:
                    "Finalize a completed byte upload. Success returns null; read workspace.get afterward for the file ID and immutable generation. Upload all bytes before calling this tool.",
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: completeWorkspaceUploadInputSchema,
    output: z.null(),
    errors,
    execute: async ({ input, services }) => {
        await services.workspace.completeUpload(input.uploadId);
        return null;
    },
});
