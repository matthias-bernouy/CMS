import type { TSystem } from "cms-content/interfaces/settings";
import { ContentValidationError } from "cms-content/core/errors";
import { defaultSystem } from "cms-content/core/system";
import { validateThemeSettings } from "cms-content/core/theme";

const SECRET_REF_PATTERN = /^\$\{[A-Z][A-Z0-9_]*\}$/;
type SettingsPatch = Omit<Partial<TSystem>, "email"> & {
    email?: Partial<TSystem["email"]>;
};

/**
 * Validate + normalize a CSP origin allow-list: each entry must be a valid
 * absolute URL with a non-null origin; the value is normalized to its
 * `URL.origin` (default ports + trailing slash stripped) and deduped.
 */
function validateOrigins(field: string, origins: string[]): string[] {
    const out = new Set<string>();
    for (const raw of origins) {
        const trimmed = raw.trim();
        if (!trimmed) continue;
        let origin: string;
        try { origin = new URL(trimmed).origin; }
        catch { throw new ContentValidationError(field, `invalid URL: "${trimmed}"`); }
        if (!origin || origin === "null") {
            throw new ContentValidationError(field, `URL has no origin: "${trimmed}"`);
        }
        out.add(origin);
    }
    return [...out];
}

/**
 * Validate + normalize a settings patch's domain-ruled fields (the security
 * CSP extras). Other sections pass through untouched. Returns a new patch with
 * normalized origins; throws `ContentValidationError`.
 */
export function validateSettingsPatch(patch: SettingsPatch): Partial<TSystem> {
    const normalized = { ...patch } as Partial<TSystem>;

    if (patch.security) {
        const security = { ...patch.security };
        if (security.connectExtras !== undefined) security.connectExtras = validateOrigins("connectExtras", security.connectExtras);
        if (security.mediaExtras   !== undefined) security.mediaExtras   = validateOrigins("mediaExtras", security.mediaExtras);
        normalized.security = security;
    }

    if (patch.email) {
        normalized.email = validateEmailSettings(patch.email);
    }

    if (patch.theme) normalized.theme = validateThemeSettings(patch.theme);

    return normalized;
}

function validateEmailSettings(email: Partial<TSystem["email"]>): TSystem["email"] {
    const base = defaultSystem().email;
    const templates = (email.templates ?? {}) as Partial<TSystem["email"]["templates"]>;
    const normalized: TSystem["email"] = {
        ...base,
        ...email,
        fromEmail: (email.fromEmail ?? base.fromEmail).trim(),
        fromName:  (email.fromName ?? base.fromName).trim(),
        replyTo:   (email.replyTo ?? base.replyTo).trim(),
        smtp:      {
            ...base.smtp,
            ...(email.smtp ?? {}),
            host:              (email.smtp?.host ?? base.smtp.host).trim(),
            username:          (email.smtp?.username ?? base.smtp.username).trim(),
            passwordSecretRef: (email.smtp?.passwordSecretRef ?? base.smtp.passwordSecretRef).trim(),
        },
        templates: {
            emailVerification: normalizeEmailTemplate(templates.emailVerification, base.templates.emailVerification),
            passwordReset:     normalizeEmailTemplate(templates.passwordReset, base.templates.passwordReset),
        },
    };

    if (normalized.transport !== "smtp") {
        throw new ContentValidationError("email.transport", "unsupported email transport.");
    }

    if (!Number.isInteger(normalized.smtp.port) || normalized.smtp.port < 1 || normalized.smtp.port > 65535) {
        throw new ContentValidationError("email.smtp.port", "must be an integer between 1 and 65535.");
    }

    if (!normalized.enabled) return normalized;

    requireEmailAddress("email.fromEmail", normalized.fromEmail);
    if (normalized.replyTo) requireEmailAddress("email.replyTo", normalized.replyTo);
    if (normalized.smtp.host.length === 0) {
        throw new ContentValidationError("email.smtp.host", "SMTP host is required when email is enabled.");
    }
    if (normalized.smtp.username.length === 0) {
        throw new ContentValidationError("email.smtp.username", "SMTP username is required when email is enabled.");
    }
    if (!SECRET_REF_PATTERN.test(normalized.smtp.passwordSecretRef)) {
        throw new ContentValidationError("email.smtp.passwordSecretRef", "must be a secret reference such as ${SMTP_PASSWORD}.");
    }

    return normalized;
}

function normalizeEmailTemplate(
    template: Partial<TSystem["email"]["templates"]["emailVerification"]> | undefined,
    base: TSystem["email"]["templates"]["emailVerification"],
): TSystem["email"]["templates"]["emailVerification"] {
    return {
        subject: typeof template?.subject === "string" ? template.subject : base.subject,
        html:    typeof template?.html    === "string" ? template.html    : base.html,
    };
}

function requireEmailAddress(field: string, value: string): void {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        throw new ContentValidationError(field, "must be a valid email address.");
    }
}
