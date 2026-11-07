import { defineCapability } from "cms-files/capabilities/define";
import { getWorkspaceInputSchema, getWorkspaceOutputSchema } from "cms-files/schemas/workspace";
import { createNamespaceErrors as errors } from "cms-files/schemas/errors";

export const getWorkspace = defineCapability({
    id: "workspace.get",
    description: "Read the server-managed site file workspace without disclosing its namespace credential.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/workspace.get",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "files_workspace_get",
                description:
                    "List files in this CMS instance’s managed storage. Use offset and limit for pagination. Read ulvia://cms/site-files for uploads.",
            },
        },
    ],
    docs: ["overview.md", "site-files.md"],
    input: getWorkspaceInputSchema,
    output: getWorkspaceOutputSchema,
    errors,
    execute: ({ input, services }) => services.workspace.get(input),
});
