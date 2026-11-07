import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    initializationListInputSchema,
    initializationListOutputSchema,
    initializationListErrors,
} from "repository/application/installations/schemas/initialization/list";
import {
    initializationAdministrator,
    initializationService,
} from "repository/application/installations/core/initialization";
export const initializationList = defineCapability({
    "id": "initialization.list",
    "access": "admin",
    "description": "List bootstrap recipes from four latest stable collections per page, using metadata only.",
    "behavior": { "effect": "query", "execution": "sync", "sensitive": true },
    "bindings": [
        {
            "id": "http",
            "transport": "http",
            "method": "QUERY",
            "path": "/initialization/recipes",
            "input": { "body": true },
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
                "name": "installations_initialization_list",
                "description":
                    "List site initialization through the ordinary Gateway. Read the review and approve its exact digest before applying.",
            },
        },
    ],
    "docs": ["initialization.md"],
    input: initializationListInputSchema,
    output: initializationListOutputSchema,
    errors: initializationListErrors,
    execute: async ({ services, context, input }) => {
        await initializationAdministrator(services, context);
        return initializationService(services, context).list(input.cursor, input.locale);
    },
});
