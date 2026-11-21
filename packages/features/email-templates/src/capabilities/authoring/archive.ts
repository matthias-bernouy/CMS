import { defineCapability, errors, response } from "../define";
import { mutationInputSchema, templateSchema } from "email-templates/schemas/templates";

export const archiveTemplate = defineCapability({
    id: "templates.archive",
    description: "Archive a template without breaking existing publication references.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "natural" },
    input: mutationInputSchema,
    output: templateSchema,
    errors,
    docs: ["overview.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/email-templates/archive",
            input: { body: true },
            response,
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "email_templates_archive",
                description: "Archive a template without breaking existing publication references.",
            },
        },
    ],
    execute: ({ input, services }) => services.emailTemplates.archive(input),
});
