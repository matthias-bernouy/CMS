import { defineCapability } from "content/application/capabilities/define";
import { exampleCaptureInputSchema, captureMetadataSchema, captureErrors } from "content/application/captures/schemas";
import { captureExample } from "content/application/captures/operations";
export const exampleCapture = defineCapability({
    id: "examples.capture",
    description:
        "Capture one installed collection example in its declared demonstration viewport. Read captures.image with the returned captureId to see the image.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/examples/capture",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, NOT_FOUND: 404, REVISION_CONFLICT: 409, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_examples_capture",
                description:
                    "Generate a private visual capture; then call content_captures_image with captureId to inspect its image.",
            },
        },
    ],
    docs: ["captures.md"],
    input: exampleCaptureInputSchema,
    output: captureMetadataSchema,
    errors: captureErrors,
    execute: ({ services, input, context }) => captureExample(services, input, context),
});
