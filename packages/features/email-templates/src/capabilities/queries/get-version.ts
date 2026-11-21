import { defineCapability, errors, response } from "../define";
import { versionInputSchema, publicationSchema } from "email-templates/schemas/templates";

export const getVersionTemplate = defineCapability({
    id: "templates.get-version",
    description: "Read one exact immutable publication, including archived templates.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    input: versionInputSchema,
    output: publicationSchema,
    errors,
    docs: ["overview.md"],
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/email-templates/get-version",
            input: { body: true },
            response,
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "email_templates_get_version",
                description: "Read one exact immutable publication, including archived templates.",
            },
        },
    ],
    execute: ({ input, services }) => services.emailTemplates.getVersion(input),
});
