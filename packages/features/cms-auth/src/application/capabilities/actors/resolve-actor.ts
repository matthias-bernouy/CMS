import { defineCapability } from "cms-auth/application/capabilities/define";
import { actorSnapshotSchema } from "cms-auth/application/schemas/actors";
import { emptyInputSchema } from "cms-auth/application/schemas/sessions";
import { serviceErrors as errors } from "cms-auth/application/schemas/errors";

export const resolveActor = defineCapability({
    id: "resolve-actor",
    description: "Resolve one trusted browser credential into the current CMS actor.",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "GET",
            path: "/resolve-actor",
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { CORE_UNAVAILABLE: 503 },
            },
        },
    ],
    docs: ["overview.md"],
    input: emptyInputSchema,
    output: actorSnapshotSchema,
    errors,
    execute: async ({ services, context }) => {
        const subject = await services.authentication.resolveCredential(context.actorCredential);
        if (!subject) {
            return { state: "anonymous" as const };
        }
        const administrator = await services.governance.administrators.get(subject.identifier);
        return {
            state: "authenticated" as const,
            subjectId: subject.identifier,
            administrator: administrator.enabled,
            authorizationRevision: administrator.revision,
        };
    },
});
