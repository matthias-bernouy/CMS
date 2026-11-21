import { templateInstallationId } from "@bernouy/email-templates";
import type { TemplateContent } from "@bernouy/email-templates";

/** Installation sources owned by Access, independent of the generic Templates domain. */
export const accountTemplateSeeds: readonly {
    id: string;
    purpose: "emailVerification" | "passwordReset";
    name: string;
    draft: TemplateContent;
}[] = [
    {
        id: templateInstallationId("ulvia/cms.access", "emailVerification", "en"),
        purpose: "emailVerification",
        name: "Access: email verification (en)",
        draft: content("Verify your email", "Open this link to verify your email"),
    },
    {
        id: templateInstallationId("ulvia/cms.access", "passwordReset", "en"),
        purpose: "passwordReset",
        name: "Access: password reset (en)",
        draft: content("Reset your password", "Open this link to reset your password"),
    },
];
function content(title: string, action: string): TemplateContent {
    return {
        subject: `${title} for {{siteName}}`,
        text: `${title} for {{siteName}}\n\n${action}: {{actionUrl}}\n\nThis link expires at {{expiresAt}}.\nIf you did not request this, you can ignore this email.`,
        html: `<h1>${title} for {{siteName}}</h1><p><a href="{{actionUrl}}">${title}</a></p><p>This link expires at {{expiresAt}}.</p><p>If you did not request this, you can ignore this email.</p>`,
        variables: [
            { name: "siteName", kind: "text", required: true },
            { name: "recipientEmail", kind: "text", required: true },
            { name: "recipientName", kind: "text", required: true },
            { name: "actionUrl", kind: "url", required: true },
            { name: "expiresAt", kind: "date-time", required: true },
        ],
    };
}
