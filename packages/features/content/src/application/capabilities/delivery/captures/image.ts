import { defineCapability } from "content/application/capabilities/define";
import { captureImageInputSchema, captureImageOutputSchema, captureErrors } from "content/application/captures/schemas";
import { captureImage } from "content/application/captures/operations";
export const imageCapture = defineCapability({
    id: "captures.image",
    description:
        "Read a private temporary capture as an inline MCP image. Capture metadata is returned by the capture creation tool.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/captures/image",
            input: { query: { captureId: "captureId" } },
            response: {
                successStatuses: [200],
                contentTypes: ["image/png"],
                errorStatuses: { INVALID_INPUT: 422, NOT_FOUND: 404, REVISION_CONFLICT: 409, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "content_captures_image",
                description:
                    "Display the PNG returned by a capture operation. Use this tool to inspect pixels; metadata alone does not show the rendered result.",
            },
        },
    ],
    docs: ["captures.md"],
    input: captureImageInputSchema,
    output: captureImageOutputSchema,
    errors: captureErrors,
    execute: ({ services, input, context }) => captureImage(services, input.captureId, context),
});
