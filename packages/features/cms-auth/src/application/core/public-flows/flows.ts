import { internalUserId } from "cms-auth/accounts/core/SubjectResolver";
import { AuthValidationError, validatePassword } from "cms-auth/application/core/validation";
import {
    isEmailDeliveryEnabled,
    sendPasswordResetForCredential,
    sendVerificationForCredential,
} from "cms-auth/application/core/public-flows/emailDelivery";
import { normalizeEmail, requireToken, validateEmail } from "cms-auth/application/core/public-flows/input";
import { prepareOrResumeLocalSignup } from "cms-auth/application/core/public-flows/signupActivation";
import type {
    PreparedSignupLocalUser,
    PublicAuthFlowConfig,
    PublicAuthSendResult,
    SignupLocalUserInput,
    SignupLocalUserResult,
} from "cms-auth/application/core/public-flows/types";

export type {
    PublicAuthFlowConfig,
    PublicAuthSendResult,
    PreparedSignupLocalUser,
    SignupLocalUserInput,
    SignupLocalUserResult,
} from "cms-auth/application/core/public-flows/types";

export async function signupLocalUser(
    cfg: PublicAuthFlowConfig,
    input: SignupLocalUserInput,
): Promise<SignupLocalUserResult> {
    return (await prepareSignupLocalUser(cfg, input)).finalize();
}

export async function prepareSignupLocalUser(
    cfg: PublicAuthFlowConfig,
    input: SignupLocalUserInput,
): Promise<PreparedSignupLocalUser> {
    const email = normalizeEmail(input.email);
    validateEmail(email);
    validatePassword(input.password);

    return prepareOrResumeLocalSignup(cfg, {
        email,
        password: input.password,
        emailDeliveryEnabled: await isEmailDeliveryEnabled(cfg),
    });
}

export async function requestEmailVerification(
    cfg: PublicAuthFlowConfig,
    input: { email: string },
): Promise<PublicAuthSendResult> {
    const email = normalizeEmail(input.email);
    validateEmail(email);
    const credential = await cfg.credentials.getByEmail(email);
    if (!credential || !(await hasActivatedMembership(cfg, credential.sub))) {
        return { sent: false };
    }
    if (!(await isEmailDeliveryEnabled(cfg))) {
        await cfg.credentials.markEmailVerified(credential.sub);
        return { sent: false };
    }
    return { sent: await sendVerificationForCredential(cfg, credential) };
}

export async function confirmEmailVerification(cfg: PublicAuthFlowConfig, input: { token: string }): Promise<void> {
    await withReservedToken(cfg, "email_verification", requireToken(input.token), "verify-email", async (sub) => {
        if (!(await hasActivatedMembership(cfg, sub))) {
            throw new AuthValidationError("token", "invalid or expired");
        }
        const marked = await cfg.credentials.markEmailVerified(sub);
        if (!marked) {
            throw new AuthValidationError("token", "credential not found");
        }
    });
}

export async function requestPasswordReset(
    cfg: PublicAuthFlowConfig,
    input: { email: string },
): Promise<PublicAuthSendResult> {
    const email = normalizeEmail(input.email);
    validateEmail(email);
    const credential = await cfg.credentials.getByEmail(email);
    if (!credential || !(await hasActivatedMembership(cfg, credential.sub)) || !(await isEmailDeliveryEnabled(cfg))) {
        return { sent: false };
    }
    return { sent: await sendPasswordResetForCredential(cfg, credential) };
}

export async function confirmPasswordReset(
    cfg: PublicAuthFlowConfig,
    input: { token: string; password: string },
): Promise<void> {
    const token = requireToken(input.token);
    validatePassword(input.password);
    await withReservedToken(cfg, "password_reset", token, `set-password:${input.password}`, async (sub) => {
        if (!(await hasActivatedMembership(cfg, sub))) {
            throw new AuthValidationError("token", "invalid or expired");
        }
        const changed = await cfg.credentials.setPassword(sub, input.password);
        if (!changed) {
            throw new AuthValidationError("token", "credential not found");
        }
        await cfg.credentials.markEmailVerified(sub);
    });
}

async function withReservedToken(
    cfg: PublicAuthFlowConfig,
    purpose: "email_verification" | "password_reset",
    token: string,
    operation: string,
    mutate: (sub: string) => Promise<void>,
): Promise<void> {
    const reservation = await cfg.tokens.reserve(purpose, token, operation);
    if (!reservation) {
        throw new AuthValidationError("token", "invalid or expired");
    }
    try {
        await mutate(reservation.authToken.sub);
        if (!(await cfg.tokens.finalize(reservation.id))) {
            throw new AuthValidationError("token", "reservation expired");
        }
    } catch (error) {
        await cfg.tokens.release(reservation.id).catch(() => false);
        throw error;
    }
    await cfg.tokens.deleteForSub(reservation.authToken.sub, purpose).catch(() => 0);
}

async function hasActivatedMembership(cfg: PublicAuthFlowConfig, credentialSub: string): Promise<boolean> {
    return Boolean(await cfg.users.getBySub(internalUserId("local", credentialSub)));
}
