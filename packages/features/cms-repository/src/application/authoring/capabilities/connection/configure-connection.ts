import { defineCapability } from "cms-repository/application/authoring/capabilities/define";
import {
    configureConnectionInputSchema,
    connectionStatusSchema,
} from "cms-repository/application/authoring/schemas/connection";
import { authoringErrors as errors } from "cms-repository/application/authoring/schemas/errors";
import { requiredText } from "cms-repository/application/authoring/core/input";
export const configureConnection = defineCapability({
    id: "configure-connection",
    description:
        "Verify and store a personal access token for the configured Repository in the encrypted authoring secret namespace.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "none" },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/configure-connection",
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
            input: { body: true },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "authoring_configure_connection",
                description:
                    "Verify and store a personal access token for the configured Repository in the encrypted authoring secret namespace.",
            },
        },
    ],
    docs: ["overview.md", "collection-authoring.md"],
    input: configureConnectionInputSchema,
    output: connectionStatusSchema,
    errors,
    execute: ({ services, input }) => services.authoring.configureConnection(requiredText(input.token)),
});
