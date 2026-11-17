import { assertCondition } from "./types";
import type { QueryCase } from "./types";

export const administrationQueries: readonly QueryCase[] = [
    {
        family: "access",
        capability: "get-user",
        input: ({ subjectId }) => ({ sub: subjectId }),
        assert: (out, context) => assertCondition(out.sub === context.subjectId && out.administrator === true),
    },
    {
        family: "access",
        capability: "list-users",
        input: () => ({ page: 1, limit: 25 }),
        assert: (out) => assertCondition(Object.values(out).some((value) => Array.isArray(value) && value.length > 0)),
    },
    {
        family: "access",
        capability: "resolve-actor",
        assert: (out, context) =>
            assertCondition(
                out.state === "authenticated" && out.subjectId === context.subjectId && out.administrator === true,
            ),
    },
    {
        family: "access",
        capability: "list-personal-access-tokens",
        assert: (out) => assertCondition(Object.values(out).some(Array.isArray)),
    },
    {
        family: "files",
        capability: "workspace.get",
        input: () => ({ offset: 0, limit: 25 }),
        assert: (out) => assertCondition(Object.keys(out).length > 0),
    },
    {
        family: "emailer.smtp",
        capability: "smtp.configuration.get",
        assert: (out) => assertCondition(Object.keys(out).length > 0),
    },
    {
        family: "observability",
        capability: "logs.query",
        input: () => ({ limit: 25 }),
        assert: (out) => assertCondition(Array.isArray(out.items)),
    },
    {
        family: "observability",
        capability: "logs.aggregate",
        input: () => ({ groupBy: "service" }),
        assert: (out) => assertCondition(Array.isArray(out.groups) && typeof out.total === "number"),
    },
];
