import { defineCapability } from "repository/application/authoring/capabilities/define";
import { emptyInputSchema } from "repository/application/authoring/schemas/common";
import { connectionStatusSchema } from "repository/application/authoring/schemas/connection";
import { authoringErrors as errors } from "repository/application/authoring/schemas/errors";
export const disconnectConnection = defineCapability({
    id: "disconnect-connection",
    description: "Delete the stored publication connection. This does not revoke the PAT on the Repository.",
    access: "admin",
    behavior: { effect: "command", execution: "sync", sensitive: true, idempotency: "natural" },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/disconnect-connection",
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, CORE_UNAVAILABLE: 503 },
            },
        },
        {
            id: "mcp",
            transport: "mcp",
            tool: {
                name: "authoring_disconnect_connection",
                description:
                    "Delete the stored publication connection. This does not revoke the PAT on the Repository.",
            },
        },
    ],
    docs: ["overview.md", "collection-authoring.md"],
    input: emptyInputSchema,
    output: connectionStatusSchema,
    errors,
    execute: ({ services }) => services.authoring.disconnectConnection(),
});
