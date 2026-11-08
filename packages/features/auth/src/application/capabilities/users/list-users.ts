import { defineCapability } from "auth/application/capabilities/define";
import { projectUser } from "auth/application/core/access/projections";
import { listUsersInputSchema, listUsersOutputSchema } from "auth/application/schemas/users";
import { serviceErrors as errors } from "auth/application/schemas/errors";

export const listUsers = defineCapability({
    id: "list-users",
    description: "List CMS members with exact email search and bounded pagination.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/list-users",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: listUsersInputSchema,
    output: listUsersOutputSchema,
    errors,
    execute: async ({ input, services }) => {
        const page = await services.users.list({
            ...(typeof input.search === "string" ? { search: input.search } : {}),
            pagination: {
                page: input.page ?? 1,
                limit: input.limit ?? 50,
            },
        });
        const administrators = await Promise.all(
            page.users.map((user) => services.governance.administrators.get(user.sub)),
        );
        return { ...page, users: page.users.map((user, index) => projectUser(user, administrators[index]!)) };
    },
});
