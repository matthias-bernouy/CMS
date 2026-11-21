import { defineCapability, errors, response } from "../define";
import { updateInputSchema, templateSchema } from "email-templates/schemas/templates";

export const updateDraftTemplate = defineCapability({
    id: "templates.update-draft",
    description: "Replace a draft using its expected revision.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "natural" },
    input: updateInputSchema,
    output: templateSchema,
    errors,
    docs: ["overview.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "PUT",
            path: "/email-templates/update-draft",
            input: { body: true },
            response,
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: { name: "email_templates_update_draft", description: "Replace a draft using its expected revision." },
        },
    ],
    execute: ({ input, services }) => services.emailTemplates.updateDraft(input),
});
