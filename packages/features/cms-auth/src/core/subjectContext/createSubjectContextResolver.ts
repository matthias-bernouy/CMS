import type { Authentication } from "cms-auth/interfaces/Authentication";

export type SubjectContext = {
    userID?: string;
};

export function createSubjectContextResolver<Role extends string>(
    auth: Authentication<Role>,
): (request: Request) => Promise<SubjectContext> {
    return async (request) => {
        const subject = await auth.getSubject(request).catch(() => null);
        return subject ? { userID: subject.identifier } : {};
    };
}
