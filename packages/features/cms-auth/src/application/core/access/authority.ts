import type { AccessGovernance } from "cms-auth/application/interfaces/AccessGovernance";
import type { AccessServices } from "cms-auth/application/interfaces/AccessServices";
import type { AccessContext } from "cms-auth/application/interfaces/AccessContext";
import { AccessError } from "cms-auth/application/core/access/errors";

export async function actorSubject(governance: AccessGovernance, context: AccessContext): Promise<string> {
    if (!context.subjectId) {
        throw new AccessError("ACTOR_UNAVAILABLE");
    }
    const sub = await governance.identities.resolve({ providerId: context.providerId }, context.subjectId);
    if (!sub) {
        throw new AccessError("ACTOR_UNAVAILABLE");
    }
    return sub;
}
export async function memberSubject(services: AccessServices, context: AccessContext): Promise<string> {
    const sub = await actorSubject(services.governance, context);
    if (!(await services.users.getBySub(sub))) {
        throw new AccessError("ACTOR_UNAVAILABLE");
    }
    return sub;
}
