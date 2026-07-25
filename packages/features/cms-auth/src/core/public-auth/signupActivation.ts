import { internalUserId } from "cms-auth/core/SubjectResolver";
import { sendVerificationForCredential } from "cms-auth/core/public-auth/emailDelivery";
import type { PublicAuthFlowConfig, SignupLocalUserResult, VerificationTarget } from "cms-auth/core/public-auth/types";
import type { LocalCredential } from "cms-auth/interfaces/LocalCredentialStore";
import type { Identity } from "cms-auth/interfaces/UsersRepository";
import type { PreparedSignupLegalAcceptance, SignupLegalAcceptancePolicy } from "cms-auth/signup-legal/contracts";

type SignupActivationContext = {
    email: string;
    password: string;
    emailDeliveryEnabled: boolean;
    legalAcceptance?: SignupLegalAcceptancePolicy;
    preparedLegalAcceptance: PreparedSignupLegalAcceptance | null;
};

export async function activateOrResumeLocalSignup<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    context: SignupActivationContext,
): Promise<SignupLocalUserResult> {
    const existing = await cfg.credentials.getByEmail(context.email);
    if (existing) {
        return resumeOrHandleActiveSignup(cfg, context, existing);
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
        return resumeOrHandleActiveSignup(cfg, context, raced);
    }
    return activateMembership(cfg, context, identity, null, true);
}

async function resumeOrHandleActiveSignup<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    context: SignupActivationContext,
    credential: LocalCredential,
): Promise<SignupLocalUserResult> {
    const identity = await verifyPendingPassword(cfg, context);
    const cmsUserId = internalUserId("local", credential.sub);
    if (await cfg.users.getBySub(cmsUserId)) {
        return finishSignup(cfg, credential, context.emailDeliveryEnabled, false);
    }

    if (!identity || identity.sub !== credential.sub) {
        return { created: false, sent: false };
    }
    return activateMembership(cfg, context, identity, credential, false);
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
    await cfg.credentials.verify(context.email, context.password);
    return null;
}

async function activateMembership<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    context: SignupActivationContext,
    identity: Identity,
    credential: LocalCredential | null,
    created: boolean,
): Promise<SignupLocalUserResult> {
    const cmsUserId = internalUserId("local", identity.sub);
    if (context.preparedLegalAcceptance && context.legalAcceptance) {
        await context.legalAcceptance.record(context.preparedLegalAcceptance, cmsUserId);
    }
    await cfg.users.upsert({ ...identity, sub: cmsUserId, provider: "local" }, cfg.defaultRole);
    const verificationTarget: VerificationTarget = credential ?? {
        sub: identity.sub,
        email: identity.email ?? context.email,
        emailVerifiedAt: null,
    };
    return finishSignup(cfg, verificationTarget, context.emailDeliveryEnabled, created);
}

async function finishSignup<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    credential: VerificationTarget,
    emailDeliveryEnabled: boolean,
    created: boolean,
): Promise<SignupLocalUserResult> {
    if (!emailDeliveryEnabled) {
        await cfg.credentials.markEmailVerified(credential.sub);
        return { created, sent: false };
    }
    return { created, sent: await sendVerificationForCredential(cfg, credential) };
}
