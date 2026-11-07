import { defineCapability } from "cms-auth/application/capabilities/define";
import { memberSubject } from "cms-auth/application/core/access/authority";
import { projectPat } from "cms-auth/application/core/access/projections";
import { emptyInputSchema } from "cms-auth/application/schemas/sessions";
import { listPersonalAccessTokensOutputSchema } from "cms-auth/application/schemas/tokens";
import { listPersonalAccessTokensErrors as errors } from "cms-auth/application/schemas/errors";

export const listPersonalAccessTokens = defineCapability({
    id: "list-personal-access-tokens",
    description: "List the authenticated account's tokens without their secrets.",
    access: "authenticated",
    behavior: { sensitive: true, effect: "query", execution: "sync" },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/personal-access-tokens",
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, ACTOR_UNAVAILABLE: 403, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    input: emptyInputSchema,
    output: listPersonalAccessTokensOutputSchema,
    errors,
    execute: async ({ services, context }) => ({
        tokens: (await services.pats.list(await memberSubject(services, context))).map(projectPat),
    }),
});
