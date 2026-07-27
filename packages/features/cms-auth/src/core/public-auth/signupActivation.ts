import { internalUserId } from "cms-auth/core/SubjectResolver";
import { sendVerificationForCredential } from "cms-auth/core/public-auth/emailDelivery";
import type {
    PreparedSignupLocalUser,
    PublicAuthFlowConfig,
    SignupLocalUserResult,
    VerificationTarget,
} from "cms-auth/core/public-auth/types";
import type { LocalCredential } from "cms-auth/interfaces/LocalCredentialStore";
import type { Identity } from "cms-auth/interfaces/UsersRepository";

type SignupActivationContext = {
    email: string;
    password: string;
    emailDeliveryEnabled: boolean;
};

export async function activateOrResumeLocalSignup<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    context: SignupActivationContext,
): Promise<SignupLocalUserResult> {
    return (await prepareOrResumeLocalSignup(cfg, context)).finalize();
}

export async function prepareOrResumeLocalSignup<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
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

async function prepareResumeOrActiveSignup<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
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

async function verifyPendingPassword<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
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

function prepareMembershipActivation<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
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
        await cfg.users.upsert({ ...identity, sub: cmsUserId, provider: "local" }, cfg.defaultRole);
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

async function finishSignup<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
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
