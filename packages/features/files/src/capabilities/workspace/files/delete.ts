import { z } from "zod";
import { defineCapability } from "files/capabilities/define";
import { deleteWorkspaceFileInputSchema } from "files/schemas/workspace";
import { workspaceErrors as errors } from "files/schemas/errors";

export const deleteWorkspaceFile = defineCapability({
    id: "workspace.files.delete",
    description: "Delete every generation of a file in the server-managed site workspace.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/workspace.files.delete",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "files_workspace_files_delete",
                description: "Delete a file from this instance’s managed storage. Verify the fileId before calling.",
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: deleteWorkspaceFileInputSchema,
    output: z.null(),
    errors,
    execute: async ({ input, services }) => {
        await services.workspace.deleteFile(input.fileId);
        return null;
    },
});
