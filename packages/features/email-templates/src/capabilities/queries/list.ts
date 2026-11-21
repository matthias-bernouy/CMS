import { defineCapability, errors, response } from "../define";
import { listInputSchema, listOutputSchema } from "email-templates/schemas/templates";

export const listTemplate = defineCapability({
    id: "templates.list",
    description: "List bounded template summaries without content bodies.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: listInputSchema,
    output: listOutputSchema,
    errors,
    docs: ["overview.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/email-templates/list",
            input: { body: true },
            response,
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "email_templates_list",
                description: "List bounded template summaries without content bodies.",
            },
        },
    ],
    execute: ({ input, services }) => services.emailTemplates.list(input),
});
