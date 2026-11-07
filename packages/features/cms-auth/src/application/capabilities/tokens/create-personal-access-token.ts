import { defineCapability } from "cms-auth/application/capabilities/define";
import { memberSubject } from "cms-auth/application/core/access/authority";
import { projectPat } from "cms-auth/application/core/access/projections";
import { personalAccessTokenInput } from "cms-auth/tokens/personal-access/core/input";
import {
    createPersonalAccessTokenInputSchema,
    createPersonalAccessTokenOutputSchema,
} from "cms-auth/application/schemas/tokens";
import { createPersonalAccessTokenErrors as errors } from "cms-auth/application/schemas/errors";

export const createPersonalAccessToken = defineCapability({
    id: "create-personal-access-token",
    description:
        "Create a personal access token for the authenticated account. The plaintext secret is returned only once.",
    access: "authenticated",
    behavior: { sensitive: true, effect: "command", execution: "sync", idempotency: "none" },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/personal-access-tokens",
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, ACTOR_UNAVAILABLE: 403, CORE_UNAVAILABLE: 503, TOKEN_LIMIT: 409 },
            },
            input: { body: { properties: ["name", "expiresAt"] } },
        },
    ],
    input: createPersonalAccessTokenInputSchema,
    output: createPersonalAccessTokenOutputSchema,
    errors,
    execute: async ({ input, services, context }) => {
        const sub = await memberSubject(services, context);
        const created = await services.pats.create({ sub, ...personalAccessTokenInput(input) });
        return { token: created.token, metadata: projectPat(created.pat) };
    },
});
