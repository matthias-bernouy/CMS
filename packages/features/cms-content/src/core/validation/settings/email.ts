import type { TSystem } from "cms-content/interfaces/settings";
import { defaultSystem } from "cms-content/core/lifecycle/system";
import { ContentValidationError } from "cms-content/core/validation/errors";

const SECRET_REF_PATTERN = /^\$\{[A-Z][A-Z0-9_]*\}$/;

export function validateEmailSettings(email: Partial<TSystem["email"]>): TSystem["email"] {
    const base = defaultSystem().email;
    const templates = (email.templates ?? {}) as Partial<TSystem["email"]["templates"]>;
    const normalized: TSystem["email"] = {
        ...base,
        ...email,
        fromEmail: (email.fromEmail ?? base.fromEmail).trim(),
        fromName: (email.fromName ?? base.fromName).trim(),
        replyTo: (email.replyTo ?? base.replyTo).trim(),
        smtp: {
            ...base.smtp,
            ...(email.smtp ?? {}),
            host: (email.smtp?.host ?? base.smtp.host).trim(),
            username: (email.smtp?.username ?? base.smtp.username).trim(),
            passwordSecretRef: (email.smtp?.passwordSecretRef ?? base.smtp.passwordSecretRef).trim(),
        },
        templates: {
            emailVerification: normalizeEmailTemplate(templates.emailVerification, base.templates.emailVerification),
            passwordReset: normalizeEmailTemplate(templates.passwordReset, base.templates.passwordReset),
        },
    };

    if (normalized.transport !== "smtp") {
        throw new ContentValidationError("email.transport", "unsupported email transport.");
    }
    if (!Number.isInteger(normalized.smtp.port) || normalized.smtp.port < 1 || normalized.smtp.port > 65535) {
        throw new ContentValidationError("email.smtp.port", "must be an integer between 1 and 65535.");
    }
    if (!normalized.enabled) {
        return normalized;
    }

    requireEmailAddress("email.fromEmail", normalized.fromEmail);
    if (normalized.replyTo) {
        requireEmailAddress("email.replyTo", normalized.replyTo);
    }
    if (normalized.smtp.host.length === 0) {
        throw new ContentValidationError("email.smtp.host", "SMTP host is required when email is enabled.");
    }
    if (normalized.smtp.username.length === 0) {
        throw new ContentValidationError("email.smtp.username", "SMTP username is required when email is enabled.");
    }
    if (!SECRET_REF_PATTERN.test(normalized.smtp.passwordSecretRef)) {
        throw new ContentValidationError(
            "email.smtp.passwordSecretRef",
            "must be a secret reference such as ${SMTP_PASSWORD}.",
        );
    }

    return normalized;
}

function normalizeEmailTemplate(
    template: Partial<TSystem["email"]["templates"]["emailVerification"]> | undefined,
    base: TSystem["email"]["templates"]["emailVerification"],
): TSystem["email"]["templates"]["emailVerification"] {
    return {
        subject: typeof template?.subject === "string" ? template.subject : base.subject,
        html: typeof template?.html === "string" ? template.html : base.html,
    };
}

function requireEmailAddress(field: string, value: string): void {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        throw new ContentValidationError(field, "must be a valid email address.");
    }
}
