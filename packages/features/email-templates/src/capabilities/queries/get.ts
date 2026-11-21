import { defineCapability, errors, response } from "../define";
import { identitySchema, templateSchema } from "email-templates/schemas/templates";

export const getTemplate = defineCapability({
    id: "templates.get",
    description: "Read one email template and its current draft.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: identitySchema,
    output: templateSchema,
    errors,
    docs: ["overview.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/email-templates/get",
            input: { body: true },
            response,
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: { name: "email_templates_get", description: "Read one email template and its current draft." },
        },
    ],
    execute: ({ input, services }) => services.emailTemplates.get(input),
});
