import { defineCapability } from "content/application/capabilities/define";
import { pageCaptureInputSchema, captureMetadataSchema, captureErrors } from "content/application/captures/schemas";
import { capturePage } from "content/application/captures/operations";
export const pageCapture = defineCapability({
    id: "pages.capture",
    description:
        "Capture the exact editable Page revision, including drafts. Read captures.image with the returned captureId to see the image.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/pages/capture",
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
                name: "content_pages_capture",
                description:
                    "Generate a private visual capture; then call content_captures_image with captureId to inspect its image.",
            },
        },
    ],
    docs: ["captures.md"],
    input: pageCaptureInputSchema,
    output: captureMetadataSchema,
    errors: captureErrors,
    execute: ({ services, input, context }) => capturePage(services, input, context),
});
