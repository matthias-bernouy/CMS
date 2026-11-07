import { defineCapability } from "repository/application/installations/capabilities/policy/define";
import {
    initializationPlanInputSchema,
    initializationPlanOutputSchema,
    initializationPlanErrors,
} from "repository/application/installations/schemas/initialization/plan";
import {
    initializationAdministrator,
    initializationService,
} from "repository/application/installations/core/initialization";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
export const initializationPlan = defineCapability({
    "id": "initialization.plan",
    "access": "admin",
    "description": "Review an exact bootstrap recipe or an explicit empty start without persisting site changes.",
    "behavior": { "effect": "query", "execution": "sync", "sensitive": true },
    "bindings": [
        {
            "id": "http",
            "transport": "http",
            "method": "QUERY",
            "path": "/initialization/plan",
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
                "name": "installations_initialization_plan",
                "description":
                    "Plan site initialization through the ordinary Gateway. Read the review and approve its exact digest before applying.",
            },
        },
    ],
    "docs": ["initialization.md"],
    input: initializationPlanInputSchema,
    output: initializationPlanOutputSchema,
    errors: initializationPlanErrors,
    execute: async ({ services, context, input }) => {
        const actorId = await initializationAdministrator(services, context);
        const review = await initializationService(services, context).plan(
            actorId,
            input.root,
            input.locale,
            context.signal,
        );
        return { planDigest: review.digest, reviewJson: canonicalizeIJson(review) };
    },
});
