import type { AuthEmailComposeInput, AuthEmailComposer, AuthEmailKind } from "cms-auth/interfaces/AuthEmailComposer";
import type { OutboundEmail } from "cms-auth/interfaces/Emailer";
import { DefaultAuthEmailComposer } from "cms-auth/default-implementation/DefaultAuthEmailComposer";

export type RuntimeAuthEmailTemplate = {
    subject: string;
    html:    string;
};

export type RuntimeAuthEmailTemplates = {
    emailVerification: RuntimeAuthEmailTemplate;
    passwordReset:     RuntimeAuthEmailTemplate;
};

export type TemplatedAuthEmailComposerConfig = {
    readTemplates(): Promise<RuntimeAuthEmailTemplates>;
    fallback?: AuthEmailComposer;
};

export class TemplatedAuthEmailComposer implements AuthEmailComposer {
    private readonly fallback: AuthEmailComposer;

    constructor(private readonly config: TemplatedAuthEmailComposerConfig) {
        this.fallback = config.fallback ?? new DefaultAuthEmailComposer();
    }

    async compose(input: AuthEmailComposeInput): Promise<OutboundEmail> {
        const [templates, fallback] = await Promise.all([
            this.config.readTemplates(),
            this.fallback.compose(input),
        ]);
        const template = templateForKind(templates, input.kind);
        const html = renderField(template.html, fallback.html, input, "html");
        return {
            to:      input.to,
            subject: renderField(template.subject, fallback.subject, input, "text") ?? fallback.subject,
            text:    fallback.text,
            ...(html ? { html } : {}),
        };
    }
}

function templateForKind(templates: RuntimeAuthEmailTemplates, kind: AuthEmailKind): RuntimeAuthEmailTemplate {
    return kind === "email_verification" ? templates.emailVerification : templates.passwordReset;
}

function renderField(
    template: string,
    fallback: string | undefined,
    input: AuthEmailComposeInput,
    mode: "text" | "html",
): string | undefined {
    if (!template.trim()) return fallback;
    return renderTemplate(template, input, mode);
}

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z][a-zA-Z0-9]*)\s*\}\}/g;

function renderTemplate(template: string, input: AuthEmailComposeInput, mode: "text" | "html"): string {
    const values: Record<string, string> = {
        actionUrl:      input.actionUrl,
        siteName:       input.siteName ?? "",
        expiresAt:      input.expiresAt.toISOString(),
        recipientEmail: input.to.email,
        recipientName:  input.to.displayName ?? "",
    };
    return template.replace(TOKEN_PATTERN, (match, key: string) => {
        if (!(key in values)) return match;
        const value = values[key]!;
        return mode === "html" ? escapeHtml(value) : value;
    });
}

function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}
