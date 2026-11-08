import { defineCapability } from "files/capabilities/define";
import { signFileOutputSchema } from "files/schemas/files";
import { signWorkspaceFileInputSchema } from "files/schemas/workspace";
import { workspaceErrors as errors } from "files/schemas/errors";

export const signWorkspaceFile = defineCapability({
    id: "workspace.files.sign",
    description: "Create a short-lived private read URL for a site workspace file generation.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/workspace.files.sign",
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
                name: "files_workspace_files_sign",
                description:
                    "Create an expiring download URL for one exact file generation. This does not make a private file public.",
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: signWorkspaceFileInputSchema,
    output: signFileOutputSchema,
    errors,
    execute: ({ input, services }) => services.workspace.signFile(input.fileId, input.generation, input.expiresIn),
});
