import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    initializationStatusInputSchema,
    initializationStatusOutputSchema,
    initializationStatusErrors,
} from "repository/application/installations/schemas/initialization/status";
import { readInitializationStatus } from "repository/application/installations/core/initialization";
export const initializationStatus = defineCapability({
    "id": "initialization.status",
    "access": "admin",
    "description": "Read durable site initialization progress. An empty site alone never implies pending setup.",
    "behavior": { "effect": "query", "execution": "sync", "sensitive": true },
    "bindings": [
        {
            "id": "http",
            "transport": "http",
            "method": "GET",
            "path": "/initialization/status",
            "input": {},
            "response": {
                "successStatuses": [200],
                "contentTypes": ["application/json"],
                "errorStatuses": {
                    "NOT_FOUND": 404,
                    "REVISION_CONFLICT": 409,
                    "UPGRADE_IN_PROGRESS": 423,
                    "INVALID_INPUT": 422,
                    "CORE_UNAVAILABLE": 503,
                    "FORBIDDEN": 403,
                    "RELEASE_MISMATCH": 409,
                },
            },
        },
        {
            "id": "mcp",
            "transport": "mcp",
            "tool": {
                "name": "installations_initialization_status",
                "description":
                    "Status site initialization through the ordinary Gateway. Read the review and approve its exact digest before applying.",
            },
        },
    ],
    "docs": ["initialization.md"],
    input: initializationStatusInputSchema,
    output: initializationStatusOutputSchema,
    errors: initializationStatusErrors,
    execute: ({ services, context }) => readInitializationStatus(services, context),
});
