import { defineCapability, errors, response } from "../define";
import { mutationInputSchema, publicationSchema } from "email-templates/schemas/templates";

export const publishTemplate = defineCapability({
    id: "templates.publish",
    description: "Publish one immutable version using the expected revision.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "natural" },
    input: mutationInputSchema,
    output: publicationSchema,
    errors,
    docs: ["overview.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/email-templates/publish",
            input: { body: true },
            response,
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "email_templates_publish",
                description: "Publish one immutable version using the expected revision.",
            },
        },
    ],
    execute: ({ input, services }) => services.emailTemplates.publish(input),
});
