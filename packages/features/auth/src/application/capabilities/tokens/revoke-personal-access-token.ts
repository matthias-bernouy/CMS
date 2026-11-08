import { defineCapability } from "auth/application/capabilities/define";
import { AccessError } from "auth/application/core/access/errors";
import { requiredText } from "auth/application/core/access/input";
import { memberSubject } from "auth/application/core/access/authority";
import {
    revokePersonalAccessTokenInputSchema,
    revokePersonalAccessTokenOutputSchema,
} from "auth/application/schemas/tokens";
import { revokePersonalAccessTokenErrors as errors } from "auth/application/schemas/errors";

export const revokePersonalAccessToken = defineCapability({
    id: "revoke-personal-access-token",
    description: "Revoke one token owned by the authenticated account.",
    access: "authenticated",
    behavior: { sensitive: true, effect: "command", execution: "sync", idempotency: "none" },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "DELETE",
            path: "/personal-access-tokens/{id}",
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { INVALID_INPUT: 422, ACTOR_UNAVAILABLE: 403, CORE_UNAVAILABLE: 503, NOT_FOUND: 404 },
            },
            input: { path: { id: "id" } },
        },
    ],
    input: revokePersonalAccessTokenInputSchema,
    output: revokePersonalAccessTokenOutputSchema,
    errors,
    execute: async ({ input, services, context }) => {
        if (!(await services.pats.revoke(await memberSubject(services, context), requiredText(input.id)))) {
            throw new AccessError("NOT_FOUND");
        }
        return { revoked: true };
    },
});
