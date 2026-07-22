import { internalUserId } from "cms-auth/core/SubjectResolver";
import { AuthValidationError, validatePassword } from "cms-auth/core/validation";
import {
    isEmailDeliveryEnabled,
    sendPasswordResetForCredential,
    sendVerificationForCredential,
} from "cms-auth/core/public-auth/emailDelivery";
import { normalizeEmail, requireToken, validateEmail } from "cms-auth/core/public-auth/input";
import type {
    PublicAuthFlowConfig,
    PublicAuthSendResult,
    SignupLocalUserInput,
    SignupLocalUserResult,
} from "cms-auth/core/public-auth/types";

export type {
    PublicAuthFlowConfig,
    PublicAuthSendResult,
    SignupLocalUserInput,
    SignupLocalUserResult,
} from "cms-auth/core/public-auth/types";

export async function signupLocalUser<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    input: SignupLocalUserInput,
): Promise<SignupLocalUserResult> {
    const email = normalizeEmail(input.email);
    validateEmail(email);
    validatePassword(input.password);

    const emailDeliveryEnabled = await isEmailDeliveryEnabled(cfg);
    const existing = await cfg.credentials.getByEmail(email);
    if (existing) {
        if (!emailDeliveryEnabled) {
            await cfg.credentials.markEmailVerified(existing.sub);
            return { created: false, sent: false };
        }
        return { created: false, sent: await sendVerificationForCredential(cfg, existing) };
    }

    const identity = await cfg.credentials.create({
        email,
        password: input.password,
        emailVerified: !emailDeliveryEnabled,
    });
    await cfg.users.upsert(
        { ...identity, sub: internalUserId("local", identity.sub), provider: "local" },
        cfg.defaultRole,
    );
    if (!emailDeliveryEnabled) {
        return { created: true, sent: false };
    }

    return {
        created: true,
        sent: await sendVerificationForCredential(cfg, { sub: identity.sub, email, emailVerifiedAt: null }),
    };
}

export async function requestEmailVerification<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    input: { email: string },
): Promise<PublicAuthSendResult> {
    const email = normalizeEmail(input.email);
    validateEmail(email);
    const credential = await cfg.credentials.getByEmail(email);
    if (!credential) {
        return { sent: false };
    }
    if (!(await isEmailDeliveryEnabled(cfg))) {
        await cfg.credentials.markEmailVerified(credential.sub);
        return { sent: false };
    }
    return { sent: await sendVerificationForCredential(cfg, credential) };
}

export async function confirmEmailVerification<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    input: { token: string },
): Promise<void> {
    const authToken = await cfg.tokens.consume("email_verification", requireToken(input.token));
    if (!authToken) {
        throw new AuthValidationError("token", "invalid or expired");
    }

    const marked = await cfg.credentials.markEmailVerified(authToken.sub);
    if (!marked) {
        throw new AuthValidationError("token", "credential not found");
    }
    await cfg.tokens.deleteForSub(authToken.sub, "email_verification");
}

export async function requestPasswordReset<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    input: { email: string },
): Promise<PublicAuthSendResult> {
    const email = normalizeEmail(input.email);
    validateEmail(email);
    const credential = await cfg.credentials.getByEmail(email);
    if (!credential || !(await isEmailDeliveryEnabled(cfg))) {
        return { sent: false };
    }
    return { sent: await sendPasswordResetForCredential(cfg, credential) };
}

export async function confirmPasswordReset<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    input: { token: string; password: string },
): Promise<void> {
    const token = requireToken(input.token);
    validatePassword(input.password);
    const authToken = await cfg.tokens.consume("password_reset", token);
    if (!authToken) {
        throw new AuthValidationError("token", "invalid or expired");
    }

    const changed = await cfg.credentials.setPassword(authToken.sub, input.password);
    if (!changed) {
        throw new AuthValidationError("token", "credential not found");
    }
    await cfg.credentials.markEmailVerified(authToken.sub);
    await cfg.tokens.deleteForSub(authToken.sub, "password_reset");
}
