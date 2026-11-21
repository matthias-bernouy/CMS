import { defineCapability, errors, response } from "../define";
import { renderInputSchema } from "email-templates/schemas/templates";
import { renderedSchema } from "email-templates/schemas/content";

export const renderTemplate = defineCapability({
    id: "templates.render",
    description: "Render one exact publication with bounded sensitive values; does not send mail.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: renderInputSchema,
    output: renderedSchema,
    errors,
    docs: ["overview.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/email-templates/render",
            input: { body: true },
            response,
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "email_templates_render",
                description: "Render one exact publication with bounded sensitive values; does not send mail.",
            },
        },
    ],
    execute: ({ input, services }) => services.emailTemplates.render(input),
});
