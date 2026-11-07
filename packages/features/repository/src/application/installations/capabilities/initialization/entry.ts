import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    initializationEntryInputSchema,
    initializationEntryOutputSchema,
    initializationEntryErrors,
} from "repository/application/installations/schemas/initialization/entry";
import { initializationService } from "repository/application/installations/core/initialization";
export const initializationEntry = defineCapability({
    "id": "initialization.entry",
    "access": "public",
    "description": "Read the minimal setup entry flag. No accounts, recipes or private site data are exposed.",
    "behavior": { "effect": "query", "execution": "sync", "sensitive": false },
    "bindings": [
        {
            "id": "http",
            "transport": "http",
            "method": "GET",
            "path": "/initialization/entry",
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
                "name": "installations_initialization_entry",
                "description":
                    "Entry site initialization through the ordinary Gateway. Read the review and approve its exact digest before applying.",
            },
        },
    ],
    "docs": ["initialization.md"],
    input: initializationEntryInputSchema,
    output: initializationEntryOutputSchema,
    errors: initializationEntryErrors,
    execute: ({ services, context }) => initializationService(services, context).entry(),
});
