import { defineCapability } from "content/application/capabilities/define";
import { examplesGetInputSchema, examplesGetOutputSchema } from "content/application/schemas/examples";
import { exampleErrors as errors } from "content/application/schemas/errors";
export const examplesGet = defineCapability({
    id: "examples.get",
    description:
        "Read one generic example document with ordinary collection text references. It has no locale, theme, Page path or publication state.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/examples/get",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_examples_get",
                description:
                    "Read a generic example document. Its HTML can be edited and submitted as ordinary Page content; no link to the example is stored.",
            },
        },
    ],
    docs: ["overview.md"],
    input: examplesGetInputSchema,
    output: examplesGetOutputSchema,
    errors,
    execute: ({ services, input }) => services.contributions.getExample(input),
});
