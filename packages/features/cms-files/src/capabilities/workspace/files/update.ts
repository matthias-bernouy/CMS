import { z } from "zod";
import { defineCapability } from "cms-files/capabilities/define";
import { fileCall } from "cms-files/capabilities/support";
import { updateWorkspaceFileInputSchema } from "cms-files/schemas/workspace";
import { workspaceErrors as errors } from "cms-files/schemas/errors";

export const updateWorkspaceFile = defineCapability({
    id: "workspace.files.update",
    description: "Rename a file in the server-managed site workspace.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/workspace.files.update",
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
                name: "files_workspace_files_update",
                description: "Rename one file in this instance without changing its immutable bytes.",
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: updateWorkspaceFileInputSchema,
    output: z.null(),
    errors,
    execute: ({ input, services, fail }) =>
        fileCall(errors, fail, async () => {
            await services.workspace.updateFile(input.fileId, input.name);
            return null;
        }),
});
