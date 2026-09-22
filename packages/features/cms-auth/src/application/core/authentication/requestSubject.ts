import type { Authentication, Subject } from "cms-auth/application/interfaces/Authentication";

type SubjectSnapshot = Readonly<Subject>;

const subjectsByRequest = new WeakMap<Request, WeakMap<object, Promise<SubjectSnapshot | null>>>();

/**
 * Resolves one stable subject snapshot for one ingress request and one
 * authentication backend. Failed lookups are evicted so callers may retry.
 */
export async function resolveRequestSubject(authentication: Authentication, request: Request): Promise<Subject | null> {
    const subjectsByAuthentication = authenticationCache(request);
    let pending = subjectsByAuthentication.get(authentication);
    if (!pending) {
        pending = Promise.resolve()
            .then(() => authentication.getSubject(request))
            .then(snapshotSubject)
            .catch((error) => {
                subjectsByAuthentication.delete(authentication);
                throw error;
            });
        subjectsByAuthentication.set(authentication, pending);
    }

    const subject = await pending;
    return subject ? { ...subject } : null;
}

function authenticationCache(request: Request): WeakMap<object, Promise<SubjectSnapshot | null>> {
    const current = subjectsByRequest.get(request);
    if (current) {
        return current;
    }
    const created = new WeakMap<object, Promise<SubjectSnapshot | null>>();
    subjectsByRequest.set(request, created);
    return created;
}

function snapshotSubject(subject: Subject | null): SubjectSnapshot | null {
    return subject ? Object.freeze({ ...subject }) : null;
}
