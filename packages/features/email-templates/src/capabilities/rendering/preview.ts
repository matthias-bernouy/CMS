import { defineCapability, errors, response } from "../define";
import { previewInputSchema } from "email-templates/schemas/templates";
import { renderedSchema } from "email-templates/schemas/content";

export const previewTemplate = defineCapability({
    id: "templates.preview",
    description: "Render a revision-checked draft without persistence or delivery.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: previewInputSchema,
    output: renderedSchema,
    errors,
    docs: ["overview.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/email-templates/preview",
            input: { body: true },
            response,
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "email_templates_preview",
                description: "Render a revision-checked draft without persistence or delivery.",
            },
        },
    ],
    execute: ({ input, services }) => services.emailTemplates.preview(input),
});
