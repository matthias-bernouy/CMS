import { defineCapability } from "cms-auth/application/capabilities/define";
import { AccessError } from "cms-auth/application/core/access/errors";
import { requiredText } from "cms-auth/application/core/access/input";
import { actorSubject } from "cms-auth/application/core/access/authority";
import { deleteUserCompletely } from "cms-auth/application/core/account-lifecycle/deleteUserCompletely";
import { deleteUserInputSchema, deleteUserOutputSchema } from "cms-auth/application/schemas/users";
import { deleteUserErrors as errors } from "cms-auth/application/schemas/errors";

export const deleteUser = defineCapability({
    id: "delete-user",
    description: "Delete one member, its local credential and personal access tokens.",
    access: "admin",
    behavior: { effect: "command", idempotency: "none", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "POST",
            path: "/delete-user",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: {
                    NOT_FOUND: 404,
                    CANNOT_REMOVE_SELF: 409,
                    PROTECTED_USER: 409,
                    ACTOR_UNAVAILABLE: 403,
                    CORE_UNAVAILABLE: 503,
                },
            },
        },
    ],
    docs: ["overview.md"],
    input: deleteUserInputSchema,
    output: deleteUserOutputSchema,
    errors,
    execute: async ({ input, services, context }) => {
        const active = services.governance;
        const sub = requiredText(input.sub);
        if ((await actorSubject(active, context)) === sub) {
            throw new AccessError("CANNOT_REMOVE_SELF");
        }
        if (!(await active.administrators.canRevoke(sub))) {
            throw new AccessError("PROTECTED_USER");
        }
        const user = await services.users.getBySub(sub);
        if (!user) {
            throw new AccessError("NOT_FOUND");
        }
        await deleteUserCompletely(
            {
                users: services.users,
                credentials: services.credentials,
                pats: services.pats,
                revokeSessionsForSub: (sub) => services.authentication.revokeSessionsForSub(sub),
                withUserDeletion: services.withUserDeletion,
                beforeMembershipDelete: async () => {
                    const state = await active.administrators.get(sub);
                    if (state.enabled) {
                        await active.administrators.set(sub, false, state.revision);
                    }
                },
            },
            user,
        );
        return { sub, deleted: true };
    },
});
