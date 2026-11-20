import { defineCapability } from "repository/application/authoring/capabilities/define";
import { preparationCaptureSchema } from "repository/application/authoring/schemas/preparations/captures";
import { captureMetadataSchema, captureErrors } from "@bernouy/content/captures";
import { capturePreparation } from "repository/application/authoring/core/capture";
export const capturePreparedExample = defineCapability({
    id: "capture-prepared-example",
    description:
        "Capture one example of an exact private collection preparation without publishing or installing. Read captures.image from Content with the returned captureId.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/capture-prepared-example",
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
                name: "authoring_capture_example",
                description:
                    "Capture a prepared collection example by preparationId and expectedDigest. Supply exact dependency releases. Then inspect its PNG using content_captures_image.",
            },
        },
    ],
    docs: ["collection-authoring.md"],
    input: preparationCaptureSchema,
    output: captureMetadataSchema,
    errors: captureErrors,
    execute: ({ services, input, context }) => capturePreparation(services, input, context),
});
