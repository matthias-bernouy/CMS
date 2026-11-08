import { defineCapability } from "auth/application/capabilities/define";
import { AccessError } from "auth/application/core/access/errors";
import { requiredText } from "auth/application/core/access/input";
import { projectUser } from "auth/application/core/access/projections";
import { deleteUserInputSchema, userViewSchema } from "auth/application/schemas/users";
import { getUserErrors as errors } from "auth/application/schemas/errors";

export const getUser = defineCapability({
    id: "get-user",
    description: "Read one CMS member and its administrator state.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/get-user",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { NOT_FOUND: 404, CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: deleteUserInputSchema,
    output: userViewSchema,
    errors,
    execute: async ({ input, services }) => {
        const sub = requiredText(input.sub);
        const user = await services.users.getBySub(sub);
        if (!user) {
            throw new AccessError("NOT_FOUND");
        }
        return projectUser(user, await services.governance.administrators.get(sub));
    },
});
