import { internalUserId } from "cms-auth/core/SubjectResolver";
import { AuthValidationError, validatePassword } from "cms-auth/core/validation";
import {
    isEmailDeliveryEnabled,
    sendPasswordResetForCredential,
    sendVerificationForCredential,
} from "cms-auth/core/public-auth/emailDelivery";
import { normalizeEmail, requireToken, validateEmail } from "cms-auth/core/public-auth/input";
import { prepareOrResumeLocalSignup } from "cms-auth/core/public-auth/signupActivation";
import type {
    PreparedSignupLocalUser,
    PublicAuthFlowConfig,
    PublicAuthSendResult,
    SignupLocalUserInput,
    SignupLocalUserResult,
} from "cms-auth/core/public-auth/types";

export type {
    PublicAuthFlowConfig,
    PublicAuthSendResult,
    PreparedSignupLocalUser,
    SignupLocalUserInput,
    SignupLocalUserResult,
} from "cms-auth/core/public-auth/types";

export async function signupLocalUser<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    input: SignupLocalUserInput,
): Promise<SignupLocalUserResult> {
    return (await prepareSignupLocalUser(cfg, input)).finalize();
}

export async function prepareSignupLocalUser<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
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

export async function requestEmailVerification<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
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

export async function confirmEmailVerification<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    input: { token: string },
): Promise<void> {
    const authToken = await cfg.tokens.consume("email_verification", requireToken(input.token));
    if (!authToken) {
        throw new AuthValidationError("token", "invalid or expired");
    }
    if (!(await hasActivatedMembership(cfg, authToken.sub))) {
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
    if (!credential || !(await hasActivatedMembership(cfg, credential.sub)) || !(await isEmailDeliveryEnabled(cfg))) {
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
    if (!(await hasActivatedMembership(cfg, authToken.sub))) {
        throw new AuthValidationError("token", "invalid or expired");
    }

    const changed = await cfg.credentials.setPassword(authToken.sub, input.password);
    if (!changed) {
        throw new AuthValidationError("token", "credential not found");
    }
    await cfg.credentials.markEmailVerified(authToken.sub);
    await cfg.tokens.deleteForSub(authToken.sub, "password_reset");
}

async function hasActivatedMembership<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    credentialSub: string,
): Promise<boolean> {
    return Boolean(await cfg.users.getBySub(internalUserId("local", credentialSub)));
}
