import { internalUserId } from "cms-auth/accounts/core/SubjectResolver";
import { sendVerificationForCredential } from "cms-auth/application/core/public-flows/emailDelivery";
import type {
    PreparedSignupLocalUser,
    PublicAuthFlowConfig,
    SignupLocalUserResult,
    VerificationTarget,
} from "cms-auth/application/core/public-flows/types";
import type { LocalCredential } from "cms-auth/providers/interfaces/LocalCredentialStore";
import type { Identity } from "cms-auth/accounts/interfaces/UsersRepository";

type SignupActivationContext = {
    email: string;
    password: string;
    emailDeliveryEnabled: boolean;
};

export async function prepareOrResumeLocalSignup(
    cfg: PublicAuthFlowConfig,
    context: SignupActivationContext,
): Promise<PreparedSignupLocalUser> {
    const existing = await cfg.credentials.getByEmail(context.email);
    if (existing) {
        return prepareResumeOrActiveSignup(cfg, context, existing);
    }

    let identity: Identity;
    try {
        identity = await cfg.credentials.create({
            email: context.email,
            password: context.password,
            emailVerified: false,
        });
    } catch (error) {
        const raced = await cfg.credentials.getByEmail(context.email);
        if (!raced) {
            throw error;
        }
        return prepareResumeOrActiveSignup(cfg, context, raced);
    }
    return prepareMembershipActivation(cfg, context, identity, null, true);
}

async function prepareResumeOrActiveSignup(
    cfg: PublicAuthFlowConfig,
    context: SignupActivationContext,
    credential: LocalCredential,
): Promise<PreparedSignupLocalUser> {
    const identity = await verifyPendingPassword(cfg, context);
    const cmsUserId = internalUserId("local", credential.sub);
    if (await cfg.users.getBySub(cmsUserId)) {
        const verifiedCmsUserId = identity?.sub === credential.sub ? cmsUserId : null;
        return preparedSignup(verifiedCmsUserId, () =>
            finishSignup(cfg, credential, context.emailDeliveryEnabled, false, verifiedCmsUserId),
        );
    }

    if (!identity || identity.sub !== credential.sub) {
        return preparedSignup(null, async () => ({
            created: false,
            sent: false,
            cmsUserId: null,
        }));
    }
    return prepareMembershipActivation(cfg, context, identity, credential, false);
}

async function verifyPendingPassword(
    cfg: PublicAuthFlowConfig,
    context: Pick<SignupActivationContext, "email" | "password">,
): Promise<Identity | null> {
    if (cfg.credentials.verifyPassword) {
        return cfg.credentials.verifyPassword(context.email, context.password);
    }
    // Older custom stores do not expose unverified-password verification.
    // Preserve password-work parity for active accounts, but fail closed when
    // a pending signup would otherwise need to be resumed.
    return cfg.credentials.verify(context.email, context.password);
}

function prepareMembershipActivation(
    cfg: PublicAuthFlowConfig,
    context: SignupActivationContext,
    identity: Identity,
    credential: LocalCredential | null,
    created: boolean,
): PreparedSignupLocalUser {
    const cmsUserId = internalUserId("local", identity.sub);
    const verificationTarget: VerificationTarget = credential ?? {
        sub: identity.sub,
        email: identity.email ?? context.email,
        emailVerifiedAt: null,
    };
    return preparedSignup(cmsUserId, async () => {
        await cfg.users.upsert({ ...identity, sub: cmsUserId, provider: "local" });
        return finishSignup(cfg, verificationTarget, context.emailDeliveryEnabled, created, cmsUserId);
    });
}

function preparedSignup(
    cmsUserId: string | null,
    operation: () => Promise<SignupLocalUserResult>,
): PreparedSignupLocalUser {
    let result: Promise<SignupLocalUserResult> | undefined;
    return {
        cmsUserId,
        finalize: () => (result ??= operation()),
    };
}

async function finishSignup(
    cfg: PublicAuthFlowConfig,
    credential: VerificationTarget,
    emailDeliveryEnabled: boolean,
    created: boolean,
    cmsUserId: string | null,
): Promise<SignupLocalUserResult> {
    if (!emailDeliveryEnabled) {
        await cfg.credentials.markEmailVerified(credential.sub);
        return { created, sent: false, cmsUserId };
    }
    return {
        created,
        sent: await sendVerificationForCredential(cfg, credential),
        cmsUserId,
    };
}
