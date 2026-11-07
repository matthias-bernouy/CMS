import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    initializationApplyInputSchema,
    initializationApplyOutputSchema,
    initializationApplyErrors,
} from "repository/application/installations/schemas/initialization/apply";
import {
    authorizeInitialization,
    initializationAdministrator,
    initializationService,
    initializationDigestInput,
    initializationExecution,
} from "repository/application/installations/core/initialization";
export const initializationApply = defineCapability({
    "id": "initialization.apply",
    "access": "admin",
    "description":
        "Apply or resume one explicitly reviewed initialization. Approval covers the exact resources and browser-code risks shown by the review.",
    "behavior": { "effect": "command", "execution": "operation", "sensitive": true, "idempotency": "keyed" },
    "bindings": [
        {
            "id": "http",
            "transport": "http",
            "method": "POST",
            "path": "/initialization/apply",
            "input": { "body": true },
            "response": {
                "successStatuses": [202],
                "contentTypes": ["application/json"],
                "errorStatuses": {
                    "NOT_FOUND": 404,
                    "REVISION_CONFLICT": 409,
                    "UPGRADE_IN_PROGRESS": 423,
                    "INVALID_INPUT": 422,
                    "CORE_UNAVAILABLE": 503,
                    "FORBIDDEN": 403,
                    "RELEASE_MISMATCH": 409,
                    "IDEMPOTENCY_CONFLICT": 409,
                    "IDEMPOTENCY_KEY_REQUIRED": 422,
                    "PROVIDER_SHUTTING_DOWN": 503,
                },
            },
        },
        {
            "id": "mcp",
            "transport": "mcp",
            "tool": {
                "name": "installations_initialization_apply",
                "description":
                    "Apply site initialization through the ordinary Gateway. Read the review and approve its exact digest before applying.",
            },
        },
    ],
    "docs": ["initialization.md"],
    input: initializationApplyInputSchema,
    output: initializationApplyOutputSchema,
    errors: initializationApplyErrors,
    authorize: authorizeInitialization,
    execute: async ({ services, context, input }) => {
        const actorId = await initializationAdministrator(services, context);
        return initializationService(services, context).apply(
            actorId,
            input.root,
            initializationDigestInput(input.planDigest),
            input.locale,
            initializationExecution(context),
        );
    },
});
