import type { AuthEmailComposer } from "cms-auth/interfaces/AuthEmailComposer";
import { isEmailDeliveryDisabledError } from "cms-auth/default-implementation/ConfiguredEmailer";
import { DefaultAuthEmailComposer } from "cms-auth/default-implementation/DefaultAuthEmailComposer";
import type { PublicAuthFlowConfig, VerificationTarget } from "cms-auth/core/public-auth/types";

const DEFAULT_EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_PASSWORD_RESET_TTL_SECONDS = 60 * 60;
const DEFAULT_AUTH_EMAIL_COOLDOWN_SECONDS = 5 * 60;
const DEFAULT_EMAIL_COMPOSER = new DefaultAuthEmailComposer();

export async function isEmailDeliveryEnabled<Role extends string>(cfg: PublicAuthFlowConfig<Role>): Promise<boolean> {
    return cfg.emailer.isEnabled ? cfg.emailer.isEnabled() : true;
}

export async function sendVerificationForCredential<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    credential: VerificationTarget,
): Promise<boolean> {
    if (credential.emailVerifiedAt || (await inEmailCooldown(cfg, "email_verification", credential.sub))) {
        return false;
    }

    await cfg.tokens.deleteForSub(credential.sub, "email_verification");
    const expiresAt = expiresIn(cfg.emailVerificationTtlSeconds ?? DEFAULT_EMAIL_VERIFICATION_TTL_SECONDS);
    const { token } = await cfg.tokens.create({ purpose: "email_verification", sub: credential.sub, expiresAt });
    const actionUrl = cfg.buildEmailVerificationUrl?.(token) ?? buildTokenUrl(cfg.emailVerificationUrl, token);
    const sent = await sendAuthEmail(
        cfg,
        await emailComposer(cfg).compose({
            kind: "email_verification",
            to: { email: credential.email },
            actionUrl,
            token,
            expiresAt,
            siteName: cfg.siteName,
        }),
    );
    if (!sent) {
        await cfg.tokens.deleteForSub(credential.sub, "email_verification");
        await cfg.credentials.markEmailVerified(credential.sub);
    }
    return sent;
}

export async function sendPasswordResetForCredential<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    credential: Pick<VerificationTarget, "sub" | "email">,
): Promise<boolean> {
    if (await inEmailCooldown(cfg, "password_reset", credential.sub)) {
        return false;
    }

    await cfg.tokens.deleteForSub(credential.sub, "password_reset");
    const expiresAt = expiresIn(cfg.passwordResetTtlSeconds ?? DEFAULT_PASSWORD_RESET_TTL_SECONDS);
    const { token } = await cfg.tokens.create({ purpose: "password_reset", sub: credential.sub, expiresAt });
    const actionUrl = cfg.buildPasswordResetUrl?.(token) ?? buildTokenUrl(cfg.passwordResetUrl, token);
    const sent = await sendAuthEmail(
        cfg,
        await emailComposer(cfg).compose({
            kind: "password_reset",
            to: { email: credential.email },
            actionUrl,
            token,
            expiresAt,
            siteName: cfg.siteName,
        }),
    );
    if (!sent) {
        await cfg.tokens.deleteForSub(credential.sub, "password_reset");
    }
    return sent;
}

async function sendAuthEmail<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    email: Awaited<ReturnType<AuthEmailComposer["compose"]>>,
): Promise<boolean> {
    try {
        await cfg.emailer.send(email);
        return true;
    } catch (error) {
        if (isEmailDeliveryDisabledError(error)) {
            return false;
        }
        throw error;
    }
}

async function inEmailCooldown<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    purpose: "email_verification" | "password_reset",
    sub: string,
): Promise<boolean> {
    const cooldownSeconds = cfg.authEmailCooldownSeconds ?? DEFAULT_AUTH_EMAIL_COOLDOWN_SECONDS;
    if (cooldownSeconds <= 0) {
        return false;
    }
    const active = await cfg.tokens.findActive(purpose, sub);
    return Boolean(active && Date.now() - active.createdAt.getTime() < cooldownSeconds * 1000);
}

function emailComposer<Role extends string>(cfg: PublicAuthFlowConfig<Role>): AuthEmailComposer {
    return cfg.emailComposer ?? DEFAULT_EMAIL_COMPOSER;
}

function buildTokenUrl(pageUrl: string, token: string): string {
    const hashIndex = pageUrl.indexOf("#");
    const beforeHash = hashIndex === -1 ? pageUrl : pageUrl.slice(0, hashIndex);
    const hash = hashIndex === -1 ? "" : pageUrl.slice(hashIndex);
    const separator = beforeHash.includes("?") ? "&" : "?";
    return `${beforeHash}${separator}token=${encodeURIComponent(token)}${hash}`;
}

function expiresIn(seconds: number): Date {
    return new Date(Date.now() + seconds * 1000);
}
