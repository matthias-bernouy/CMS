import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { requestEmailVerification, requestPasswordReset } from "@bernouy/cms-auth";

type LocalUserCredential = {
    email: string;
    rawSub: string;
    verified: boolean;
};

export async function sendUserEmailVerification(cms: ControlCms, sub: string): Promise<{ sent: boolean }> {
    const local = await localCredentialForUser(cms, sub);
    if (local.verified) {
        return { sent: false };
    }
    return requestEmailVerification(cms.publicAuth, { email: local.email });
}

export async function sendUserPasswordReset(cms: ControlCms, sub: string): Promise<{ sent: boolean }> {
    const local = await localCredentialForUser(cms, sub);
    return requestPasswordReset(cms.publicAuth, { email: local.email });
}

export async function markUserEmailVerified(cms: ControlCms, sub: string): Promise<{ ok: true }> {
    const local = await localCredentialForUser(cms, sub);
    const ok = await cms.credentials.markEmailVerified(local.rawSub);
    if (!ok) {
        throw new InvalidParam("sub", "credential not found");
    }
    return { ok: true };
}

async function localCredentialForUser(cms: ControlCms, sub: string): Promise<LocalUserCredential> {
    const user = await cms.users.getBySub(sub);
    if (!user) {
        throw new InvalidParam("sub", "unknown user");
    }
    if (user.provider !== "local" || !user.email) {
        throw new InvalidParam("sub", "not a local user");
    }
    const credential = await cms.credentials.getByEmail(user.email);
    if (!credential) {
        throw new InvalidParam("sub", "credential not found");
    }
    return {
        email: credential.email,
        rawSub: credential.sub,
        verified: credential.emailVerifiedAt !== null,
    };
}
