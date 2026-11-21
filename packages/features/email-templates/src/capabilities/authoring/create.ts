import { defineCapability, errors, response } from "../define";
import { createInputSchema, templateSchema } from "email-templates/schemas/templates";

export const createTemplate = defineCapability({
    id: "templates.create",
    description: "Create an instance-scoped email template using a caller-generated UUID.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "natural" },
    input: createInputSchema,
    output: templateSchema,
    errors,
    docs: ["overview.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/email-templates/create",
            input: { body: true },
            response,
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "email_templates_create",
                description: "Create an instance-scoped email template using a caller-generated UUID.",
            },
        },
    ],
    execute: ({ input, services }) => services.emailTemplates.create(input),
});
