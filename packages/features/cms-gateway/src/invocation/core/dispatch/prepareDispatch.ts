import type { DelegationContext } from "cms-gateway/access/delegation/interfaces";

/** Independent identity/delegation reads share one wait; a partially prepared root never leaks. */
export async function prepareDispatch<T>(
    identity: () => Promise<T>,
    issue: () => Promise<DelegationContext | null>,
    close: (delegation: DelegationContext) => Promise<void>,
): Promise<{ subjectId: T; delegation: DelegationContext | null }> {
    const [subject, root] = await Promise.allSettled([Promise.resolve().then(identity), Promise.resolve().then(issue)]);
    if (subject.status === "rejected" || root.status === "rejected") {
        if (root.status === "fulfilled" && root.value) {
            await close(root.value).catch(() => undefined);
        }
        throw subject.status === "rejected" ? subject.reason : (root as PromiseRejectedResult).reason;
    }
    return { subjectId: subject.value, delegation: root.value };
}
