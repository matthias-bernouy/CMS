import type { PublicAuthFlowConfig } from "cms-auth/core/public-auth/types";

export async function compensateFailedSignup<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    credentialSub: string,
    cmsUserId: string,
    membershipPersisted: boolean,
    cause: unknown,
): Promise<never> {
    const cleanupFailures: unknown[] = [];
    if (membershipPersisted) {
        try {
            if (!(await cfg.users.delete(cmsUserId))) {
                cleanupFailures.push(new Error("CMS membership rollback did not remove the newly-created user."));
            }
        } catch (error) {
            cleanupFailures.push(error);
        }
    }
    try {
        if (!(await cfg.credentials.delete(credentialSub))) {
            cleanupFailures.push(new Error("Credential rollback did not remove the newly-created credential."));
        }
    } catch (error) {
        cleanupFailures.push(error);
    }
    if (cleanupFailures.length > 0) {
        throw new AggregateError([cause, ...cleanupFailures], "Signup failed and its compensation was incomplete.");
    }
    throw cause;
}
