import { z } from "zod";
import { defineCapability } from "files/capabilities/define";
import { setWorkspaceFileVisibilityInputSchema } from "files/schemas/workspace";
import { workspaceErrors as errors } from "files/schemas/errors";

export const setWorkspaceFileVisibility = defineCapability({
    id: "workspace.files.set-visibility",
    description: "Set whether a site workspace file is public or private.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/workspace.files.set-visibility",
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
                name: "files_workspace_files_set_visibility",
                description: "Make one site file public or private without replacing its bytes.",
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: setWorkspaceFileVisibilityInputSchema,
    output: z.null(),
    errors,
    execute: async ({ input, services }) => {
        await services.workspace.setFileVisibility(input.fileId, input.visibility);
        return null;
    },
});
