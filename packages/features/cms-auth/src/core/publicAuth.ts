import type { AuthEmailComposer } from "cms-auth/interfaces/AuthEmailComposer";
import type { AuthTokenStore } from "cms-auth/interfaces/AuthTokenStore";
import type { Emailer } from "cms-auth/interfaces/Emailer";
import type { LocalCredentialStore } from "cms-auth/interfaces/LocalCredentialStore";
import type { TUser, UsersRepository } from "cms-auth/interfaces/UsersRepository";
import { internalUserId } from "cms-auth/core/SubjectResolver";
import { AuthValidationError, validatePassword } from "cms-auth/core/validation";
import { DefaultAuthEmailComposer } from "cms-auth/default-implementation/DefaultAuthEmailComposer";
import { isEmailDeliveryDisabledError } from "cms-auth/default-implementation/ConfiguredEmailer";

const DEFAULT_EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60;
const DEFAULT_PASSWORD_RESET_TTL_SECONDS = 60 * 60;
const DEFAULT_AUTH_EMAIL_COOLDOWN_SECONDS = 5 * 60;
const DEFAULT_EMAIL_COMPOSER = new DefaultAuthEmailComposer();

type VerificationTarget = {
    sub:             string;
    email:           string;
    emailVerifiedAt: Date | null;
};

export type PublicAuthFlowConfig<Role extends string = string> = {
    credentials: LocalCredentialStore;
    users:       UsersRepository<Role>;
    tokens:      AuthTokenStore;
    emailer:     Emailer;
    emailComposer?: AuthEmailComposer;
    defaultRole: Role;
    /** Frontend page where users land after clicking a verification email. */
    emailVerificationUrl: string;
    /** Frontend page where users land after clicking a password-reset email. */
    passwordResetUrl: string;
    siteName?: string;
    emailVerificationTtlSeconds?: number;
    passwordResetTtlSeconds?:     number;
    /** Cooldown before another auth email can be sent for the same subject and
     *  purpose. Defaults to 5 minutes. Set 0 in tests/dev to disable. */
    authEmailCooldownSeconds?:    number;
    buildEmailVerificationUrl?:   (token: string) => string;
    buildPasswordResetUrl?:       (token: string) => string;
};

export type SignupLocalUserInput = {
    email:        string;
    password:     string;
    displayName?: string;
};

export type PublicAuthSendResult = {
    sent: boolean;
};

export type SignupLocalUserResult = PublicAuthSendResult & {
    created: boolean;
};

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
        displayName: input.displayName,
        emailVerified: !emailDeliveryEnabled,
    });
    const user = await cfg.users.upsert(
        { ...identity, sub: internalUserId("local", identity.sub), provider: "local" },
        cfg.defaultRole,
    );
    if (!emailDeliveryEnabled) return { created: true, sent: false };

    return {
        created: true,
        sent: await sendVerificationForCredential(cfg, { sub: identity.sub, email, emailVerifiedAt: null }, user),
    };
}

export async function requestEmailVerification<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    input: { email: string },
): Promise<PublicAuthSendResult> {
    const email = normalizeEmail(input.email);
    validateEmail(email);
    const credential = await cfg.credentials.getByEmail(email);
    if (!credential) return { sent: false };
    if (!await isEmailDeliveryEnabled(cfg)) {
        await cfg.credentials.markEmailVerified(credential.sub);
        return { sent: false };
    }
    return { sent: await sendVerificationForCredential(cfg, credential) };
}

export async function confirmEmailVerification<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    input: { token: string },
): Promise<void> {
    const token = requireToken(input.token);
    const authToken = await cfg.tokens.consume("email_verification", token);
    if (!authToken) throw new AuthValidationError("token", "invalid or expired");

    const marked = await cfg.credentials.markEmailVerified(authToken.sub);
    if (!marked) throw new AuthValidationError("token", "credential not found");
    await cfg.tokens.deleteForSub(authToken.sub, "email_verification");
}

export async function requestPasswordReset<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    input: { email: string },
): Promise<PublicAuthSendResult> {
    const email = normalizeEmail(input.email);
    validateEmail(email);
    const credential = await cfg.credentials.getByEmail(email);
    if (!credential) return { sent: false };
    if (!await isEmailDeliveryEnabled(cfg)) return { sent: false };

    if (await inEmailCooldown(cfg, "password_reset", credential.sub)) return { sent: false };

    await cfg.tokens.deleteForSub(credential.sub, "password_reset");
    const expiresAt = expiresIn(cfg.passwordResetTtlSeconds ?? DEFAULT_PASSWORD_RESET_TTL_SECONDS);
    const { token } = await cfg.tokens.create({ purpose: "password_reset", sub: credential.sub, expiresAt });
    const user = await readLocalUser(cfg.users, credential.sub);
    const actionUrl = cfg.buildPasswordResetUrl?.(token) ?? buildTokenUrl(cfg.passwordResetUrl, token);
    const sent = await sendAuthEmail(cfg, await emailComposer(cfg).compose({
        kind: "password_reset",
        to: { email: credential.email, displayName: user?.displayName },
        actionUrl,
        token,
        expiresAt,
        siteName: cfg.siteName,
    }));
    if (!sent) {
        await cfg.tokens.deleteForSub(credential.sub, "password_reset");
    }
    return { sent };
}

export async function confirmPasswordReset<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    input: { token: string; password: string },
): Promise<void> {
    const token = requireToken(input.token);
    validatePassword(input.password);
    const authToken = await cfg.tokens.consume("password_reset", token);
    if (!authToken) throw new AuthValidationError("token", "invalid or expired");

    const changed = await cfg.credentials.setPassword(authToken.sub, input.password);
    if (!changed) throw new AuthValidationError("token", "credential not found");
    await cfg.credentials.markEmailVerified(authToken.sub);
    await cfg.tokens.deleteForSub(authToken.sub, "password_reset");
}

async function sendVerificationForCredential<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    credential: VerificationTarget,
    knownUser?: TUser<Role>,
): Promise<boolean> {
    if (credential.emailVerifiedAt) return false;
    if (await inEmailCooldown(cfg, "email_verification", credential.sub)) return false;

    await cfg.tokens.deleteForSub(credential.sub, "email_verification");
    const expiresAt = expiresIn(cfg.emailVerificationTtlSeconds ?? DEFAULT_EMAIL_VERIFICATION_TTL_SECONDS);
    const { token } = await cfg.tokens.create({ purpose: "email_verification", sub: credential.sub, expiresAt });
    const user = knownUser ?? await readLocalUser(cfg.users, credential.sub);
    const actionUrl = cfg.buildEmailVerificationUrl?.(token) ?? buildTokenUrl(cfg.emailVerificationUrl, token);
    const sent = await sendAuthEmail(cfg, await emailComposer(cfg).compose({
        kind: "email_verification",
        to: { email: credential.email, displayName: user?.displayName },
        actionUrl,
        token,
        expiresAt,
        siteName: cfg.siteName,
    }));
    if (!sent) {
        await cfg.tokens.deleteForSub(credential.sub, "email_verification");
        await cfg.credentials.markEmailVerified(credential.sub);
    }
    return sent;
}

async function isEmailDeliveryEnabled<Role extends string>(cfg: PublicAuthFlowConfig<Role>): Promise<boolean> {
    return cfg.emailer.isEnabled ? cfg.emailer.isEnabled() : true;
}

async function sendAuthEmail<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    email: Awaited<ReturnType<AuthEmailComposer["compose"]>>,
): Promise<boolean> {
    try {
        await cfg.emailer.send(email);
        return true;
    } catch (error) {
        if (isEmailDeliveryDisabledError(error)) return false;
        throw error;
    }
}

async function inEmailCooldown<Role extends string>(
    cfg: PublicAuthFlowConfig<Role>,
    purpose: "email_verification" | "password_reset",
    sub: string,
): Promise<boolean> {
    const cooldownSeconds = cfg.authEmailCooldownSeconds ?? DEFAULT_AUTH_EMAIL_COOLDOWN_SECONDS;
    if (cooldownSeconds <= 0) return false;
    const active = await cfg.tokens.findActive(purpose, sub);
    if (!active) return false;
    return Date.now() - active.createdAt.getTime() < cooldownSeconds * 1000;
}

function emailComposer<Role extends string>(cfg: PublicAuthFlowConfig<Role>): AuthEmailComposer {
    return cfg.emailComposer ?? DEFAULT_EMAIL_COMPOSER;
}

async function readLocalUser<Role extends string>(users: UsersRepository<Role>, credentialSub: string): Promise<TUser<Role> | null> {
    return users.getBySub(internalUserId("local", credentialSub));
}

function buildTokenUrl(pageUrl: string, token: string): string {
    const hashIndex = pageUrl.indexOf("#");
    const beforeHash = hashIndex === -1 ? pageUrl : pageUrl.slice(0, hashIndex);
    const hash = hashIndex === -1 ? "" : pageUrl.slice(hashIndex);
    const sep = beforeHash.includes("?") ? "&" : "?";
    return `${beforeHash}${sep}token=${encodeURIComponent(token)}${hash}`;
}

function expiresIn(seconds: number): Date {
    return new Date(Date.now() + seconds * 1000);
}

function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

function validateEmail(email: string): void {
    if (!email || !email.includes("@")) throw new AuthValidationError("email", "invalid");
}

function requireToken(token: string): string {
    if (!token) throw new AuthValidationError("token", "required");
    return token;
}
