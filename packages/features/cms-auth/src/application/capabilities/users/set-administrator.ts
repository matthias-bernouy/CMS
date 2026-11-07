import { defineCapability } from "cms-auth/application/capabilities/define";
import { AccessError } from "cms-auth/application/core/access/errors";
import { requiredText } from "cms-auth/application/core/access/input";
import { actorSubject } from "cms-auth/application/core/access/authority";
import { setAdministratorInputSchema, setAdministratorOutputSchema } from "cms-auth/application/schemas/users";
import { setAdministratorErrors as errors } from "cms-auth/application/schemas/errors";

export const setAdministrator = defineCapability({
    id: "set-administrator",
    description: "Grant or revoke administrator access with revision control and self-lockout protection.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/set-administrator",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    INVALID_INPUT: 422,
                    NOT_FOUND: 404,
                    CANNOT_REMOVE_SELF: 409,
                    REVISION_CONFLICT: 409,
                    ACTOR_UNAVAILABLE: 403,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: setAdministratorInputSchema,
    output: setAdministratorOutputSchema,
    errors,
    execute: async ({ input, services, context }) => {
        const active = services.governance;
        const sub = requiredText(input.sub);
        if (!(await services.users.getBySub(sub))) {
            throw new AccessError("NOT_FOUND");
        }
        const enabled = input.enabled === true;
        if (!enabled && (await actorSubject(active, context)) === sub) {
            throw new AccessError("CANNOT_REMOVE_SELF");
        }
        const state = await active.administrators.set(sub, enabled, input.expectedRevision);
        return {
            sub,
            administrator: state.enabled,
            revision: state.revision,
            bootstrap: state.bootstrap,
        };
    },
});
