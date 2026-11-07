import { defineCapability } from "cms-auth/application/capabilities/define";
import { AccessError } from "cms-auth/application/core/access/errors";
import { requiredText } from "cms-auth/application/core/access/input";
import { inspectActorInputSchema, actorSnapshotSchema } from "cms-auth/application/schemas/actors";
import { inspectActorErrors as errors } from "cms-auth/application/schemas/errors";

export const inspectActor = defineCapability({
    id: "inspect-actor",
    description:
        "Inspect live membership and authorization revision for a gateway delegation. Signed gateway system authority only.",
    access: "admin",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/access/actors/inspect",
            response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: { FORBIDDEN: 403 } },
            input: { body: true },
        },
    ],
    docs: ["overview.md"],
    input: inspectActorInputSchema,
    output: actorSnapshotSchema,
    errors,
    execute: async ({ input, services, context }) => {
        if (context.systemServiceId !== "cms-gateway" || context.subjectId || context.sourceInstallationId) {
            throw new AccessError("FORBIDDEN");
        }
        const sub = requiredText(input.subjectId);
        if (!(await services.users.getBySub(sub))) {
            return { state: "anonymous" as const };
        }
        const administrator = await services.governance.administrators.get(sub);
        return {
            state: "authenticated" as const,
            subjectId: sub,
            administrator: administrator.enabled,
            authorizationRevision: administrator.revision,
        };
    },
});
