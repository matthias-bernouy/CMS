import type { AuthEmailComposeInput, AuthEmailComposer } from "cms-auth/interfaces/AuthEmailComposer";
import type { OutboundEmail } from "cms-auth/interfaces/Emailer";

export class DefaultAuthEmailComposer implements AuthEmailComposer {
    async compose(input: AuthEmailComposeInput): Promise<OutboundEmail> {
        return input.kind === "email_verification" ? verificationEmail(input) : passwordResetEmail(input);
    }
}

function verificationEmail(input: AuthEmailComposeInput): OutboundEmail {
    const site = input.siteName ?? "the site";
    const subject = `Verify your email for ${site}`;
    return {
        to: input.to,
        subject,
        text: [
            `Verify your email for ${site}`,
            "",
            `Open this link to verify your email: ${input.actionUrl}`,
            "",
            `This link expires at ${input.expiresAt.toISOString()}.`,
            "If you did not request this, you can ignore this email.",
        ].join("\n"),
        html: simpleHtml(subject, "Verify email", input.actionUrl, input.expiresAt),
    };
}

function passwordResetEmail(input: AuthEmailComposeInput): OutboundEmail {
    const site = input.siteName ?? "the site";
    const subject = `Reset your password for ${site}`;
    return {
        to: input.to,
        subject,
        text: [
            `Reset your password for ${site}`,
            "",
            `Open this link to reset your password: ${input.actionUrl}`,
            "",
            `This link expires at ${input.expiresAt.toISOString()}.`,
            "If you did not request this, you can ignore this email.",
        ].join("\n"),
        html: simpleHtml(subject, "Reset password", input.actionUrl, input.expiresAt),
    };
}

function simpleHtml(title: string, cta: string, actionUrl: string, expiresAt: Date): string {
    const safeTitle = esc(title);
    const safeCta = esc(cta);
    const safeUrl = esc(actionUrl);
    return [
        "<!doctype html>",
        "<html>",
        '<body style="margin:0;padding:24px;font-family:Arial,sans-serif;color:#111827;background:#ffffff">',
        `<h1 style=\"font-size:20px;line-height:1.3;margin:0 0 16px\">${safeTitle}</h1>`,
        `<p style=\"font-size:14px;line-height:1.5;margin:0 0 24px\">Use the link below to continue.</p>`,
        `<p style=\"margin:0 0 24px\"><a href=\"${safeUrl}\" style=\"display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 14px;border-radius:4px;font-size:14px\">${safeCta}</a></p>`,
        `<p style=\"font-size:12px;line-height:1.5;color:#6b7280;margin:0 0 12px\">This link expires at ${esc(expiresAt.toISOString())}.</p>`,
        `<p style=\"font-size:12px;line-height:1.5;color:#6b7280;margin:0\">If the button does not work, copy and paste this URL: ${safeUrl}</p>`,
        "</body>",
        "</html>",
    ].join("");
}

function esc(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
