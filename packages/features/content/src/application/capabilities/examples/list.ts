import { defineCapability } from "content/application/capabilities/define";
import { examplesListInputSchema, examplesListOutputSchema } from "content/application/schemas/examples";
import { exampleErrors as errors } from "content/application/schemas/errors";
export const examplesList = defineCapability({
    id: "examples.list",
    description:
        "Browse a bounded page of generic document examples from one installed collection. Examples have no routes or publication lifecycle.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/examples/list",
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
                name: "content_examples_list",
                description:
                    "List descriptions and viewport frames of examples in one installed collection. Read one document with examples.get.",
            },
        },
    ],
    docs: ["overview.md"],
    input: examplesListInputSchema,
    output: examplesListOutputSchema,
    errors,
    execute: ({ services, input }) => services.contributions.listExamples(input),
});
